import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { heartbeatRuns, managedGatewayTokens, type Db } from "@paperclipai/db";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { logActivity } from "./activity-log.js";
import { readManagedGatewayConfig } from "./managed-gateway.js";
import { isSaasMode } from "../saas-mode.js";
import { readSocialagentPublicUrl } from "../socialagent-public-url.js";
import { unprocessable } from "../errors.js";

/** Route prefix of the run-scoped gateway proxy (see routes/managed-gateway-proxy.ts). */
export const MANAGED_GATEWAY_PROXY_PATH = "/api/managed-gateway/v1";
/** Upper bound of a gateway token's lifetime, whatever the run timeout. */
export const MANAGED_GATEWAY_TOKEN_MAX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Heartbeat statuses during which a run may still call the model. Every other
 * status (succeeded, failed, cancelled, interrupted, timed_out, or anything
 * added later) invalidates the run's gateway tokens.
 */
const ACTIVE_RUN_STATUSES: ReadonlySet<string> = new Set(["queued", "scheduled_retry", "running"]);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The server's public origin that sandboxes can reach (SOCIALAGENT_PUBLIC_URL),
 * without a trailing slash, or null when it is not configured or invalid
 * (not https on a non-loopback host).
 */
export function readManagedGatewayPublicUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return readSocialagentPublicUrl(env);
}

/** The proxy base URL a sandbox uses in place of the 9Router base URL. */
export function managedGatewayProxyBaseUrl(publicUrl: string) {
  return `${publicUrl}${MANAGED_GATEWAY_PROXY_PATH}`;
}

/** Run timeout or 24 hours, whichever is less. A timeout of 0 means none. */
export function managedGatewayTokenExpiry(timeoutSec: unknown, now = Date.now()) {
  const timeoutMs = typeof timeoutSec === "number" && Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : Infinity;
  return new Date(now + Math.min(timeoutMs, MANAGED_GATEWAY_TOKEN_MAX_TTL_MS));
}

/** Lifetime cap of a probe token (an agent test with no heartbeat run). */
export const MANAGED_GATEWAY_PROBE_TOKEN_TTL_MS = 15 * 60 * 1000;

export type ManagedGatewayTokenKind = "run" | "probe";

/**
 * Issues a gateway token. Returns the plaintext token once; only its SHA-256
 * hash is stored. A 'run' token is bound to an existing heartbeat run; a
 * 'probe' token to a synthetic id with no heartbeat row, and its expiry is
 * capped at 15 minutes.
 */
export async function issueRunGatewayToken(
  db: Db,
  input: { companyId: string; runId: string; expiresAt: Date; kind?: ManagedGatewayTokenKind },
): Promise<string> {
  const kind = input.kind ?? "run";
  const now = Date.now();
  const expiresAt = kind === "probe"
    ? new Date(Math.min(input.expiresAt.getTime(), now + MANAGED_GATEWAY_PROBE_TOKEN_TTL_MS))
    : input.expiresAt;
  const token = `sagw_${randomBytes(32).toString("base64url")}`;
  const [row] = await db.insert(managedGatewayTokens).values({
    companyId: input.companyId,
    runId: input.runId,
    kind,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: new Date(now),
  }).returning({ id: managedGatewayTokens.id });
  await logActivity(db, {
    companyId: input.companyId,
    actorType: "system",
    actorId: "managed-gateway",
    action: "managed_gateway.token_issued",
    entityType: "managed_gateway_token",
    entityId: row!.id,
    // The bound run is in details: activity_log.run_id is a foreign key, and
    // this entry must not depend on (or pin) the heartbeat row.
    runId: null,
    details: { kind, boundRunId: input.runId, expiresAt: expiresAt.toISOString() },
  });
  return token;
}

/** Revokes every live gateway token bound to a run. Idempotent. */
export async function revokeRunGatewayTokens(db: Db, runId: string): Promise<void> {
  const revoked = await db.update(managedGatewayTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(managedGatewayTokens.runId, runId), isNull(managedGatewayTokens.revokedAt)))
    .returning({ id: managedGatewayTokens.id, companyId: managedGatewayTokens.companyId });
  if (revoked.length === 0) return;
  for (const companyId of new Set(revoked.map(row => row.companyId))) {
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "managed-gateway",
      action: "managed_gateway.tokens_revoked",
      entityType: "heartbeat_run",
      entityId: runId,
      runId: null,
      details: { tokenIds: revoked.filter(row => row.companyId === companyId).map(row => row.id) },
    });
  }
}

/**
 * Resolves a presented token to its company and run, or null. Any token must
 * be unexpired and unrevoked. A 'run' token additionally needs its heartbeat
 * row to exist, belong to the token's company and still be active. A 'probe'
 * token must have no heartbeat row and a lifetime of at most 15 minutes.
 */
export async function resolveRunGatewayToken(db: Db, token: string): Promise<{ companyId: string; runId: string } | null> {
  if (!token) return null;
  const [row] = await db.select({
    companyId: managedGatewayTokens.companyId,
    runId: managedGatewayTokens.runId,
    kind: managedGatewayTokens.kind,
    createdAt: managedGatewayTokens.createdAt,
    expiresAt: managedGatewayTokens.expiresAt,
    runStatus: heartbeatRuns.status,
    runCompanyId: heartbeatRuns.companyId,
  })
    .from(managedGatewayTokens)
    .leftJoin(heartbeatRuns, eq(heartbeatRuns.id, managedGatewayTokens.runId))
    .where(and(
      eq(managedGatewayTokens.tokenHash, hashToken(token)),
      isNull(managedGatewayTokens.revokedAt),
      gt(managedGatewayTokens.expiresAt, new Date()),
    ))
    .limit(1);
  if (!row) return null;
  if (row.kind === "run") {
    if (row.runCompanyId === null || row.runCompanyId !== row.companyId || !ACTIVE_RUN_STATUSES.has(row.runStatus ?? "")) return null;
  } else if (row.kind === "probe") {
    if (row.runCompanyId !== null) return null;
    if (row.expiresAt.getTime() - row.createdAt.getTime() > MANAGED_GATEWAY_PROBE_TOKEN_TTL_MS) return null;
  } else {
    return null;
  }
  return { companyId: row.companyId, runId: row.runId };
}

function containsString(value: unknown, needle: string, depth = 0): boolean {
  if (typeof value === "string") return value.includes(needle);
  if (depth > 32 || !value || typeof value !== "object") return false;
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    if (containsString(entry, needle, depth + 1)) return true;
  }
  return false;
}

function managedGatewayKeyExposed() {
  // Never echo the value or where in the configuration it was found.
  return unprocessable(
    "This run's configuration resolves to the managed AI gateway key, which agents may never receive. Remove that value from the agent, project or environment settings.",
    { code: "managed_gateway_key_exposed" },
  );
}

/**
 * SaaS defense in depth: refuses (422) when any string in a resolved agent
 * runtime configuration, secret_ref bindings included, contains the
 * operator's 9Router key. No-op outside SaaS mode or without a key.
 */
export function assertNoManagedGatewayKey(value: unknown): void {
  if (!isSaasMode()) return;
  const key = readManagedGatewayConfig()?.apiKey;
  if (key && containsString(value, key)) throw managedGatewayKeyExposed();
}

/** As assertNoManagedGatewayKey, for every file under a prepared runtime home. */
export async function assertNoManagedGatewayKeyInDirectory(directory: string | undefined): Promise<void> {
  if (!directory || !isSaasMode()) return;
  const key = readManagedGatewayConfig()?.apiKey;
  if (!key) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertNoManagedGatewayKeyInDirectory(full);
    else if (entry.isFile() && (await readFile(full, "utf8")).includes(key)) throw managedGatewayKeyExposed();
  }
}

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { heartbeatRuns, managedGatewayTokens, type Db } from "@paperclipai/db";
import { logActivity } from "./activity-log.js";

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
 * without a trailing slash, or null when it is not configured.
 */
export function readManagedGatewayPublicUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.SOCIALAGENT_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return value ? value : null;
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

/**
 * Issues a run-scoped gateway token. Returns the plaintext token once; only
 * its SHA-256 hash is stored. `runId` names the heartbeat run the token is
 * bound to; `activityRunId` is null for a probe that has no heartbeat row.
 */
export async function issueRunGatewayToken(
  db: Db,
  input: { companyId: string; runId: string; expiresAt: Date; activityRunId?: string | null },
): Promise<string> {
  const token = `sagw_${randomBytes(32).toString("base64url")}`;
  const [row] = await db.insert(managedGatewayTokens).values({
    companyId: input.companyId,
    runId: input.runId,
    tokenHash: hashToken(token),
    expiresAt: input.expiresAt,
  }).returning({ id: managedGatewayTokens.id });
  await logActivity(db, {
    companyId: input.companyId,
    actorType: "system",
    actorId: "managed-gateway",
    action: "managed_gateway.token_issued",
    entityType: "managed_gateway_token",
    entityId: row!.id,
    runId: input.activityRunId === undefined ? input.runId : input.activityRunId,
    details: { boundRunId: input.runId, expiresAt: input.expiresAt.toISOString() },
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
  const [run] = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
  for (const companyId of new Set(revoked.map(row => row.companyId))) {
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "managed-gateway",
      action: "managed_gateway.tokens_revoked",
      entityType: "heartbeat_run",
      entityId: runId,
      runId: run ? runId : null,
      details: { tokenIds: revoked.filter(row => row.companyId === companyId).map(row => row.id) },
    });
  }
}

/**
 * Resolves a presented token to its company and run, or null. A token is
 * valid while unexpired and unrevoked, and while its heartbeat run (in the
 * same company) is still active. A probe token has no heartbeat row; it is
 * bounded by its short expiry and revoked when the probe finishes.
 */
export async function resolveRunGatewayToken(db: Db, token: string): Promise<{ companyId: string; runId: string } | null> {
  if (!token) return null;
  const [row] = await db.select({
    companyId: managedGatewayTokens.companyId,
    runId: managedGatewayTokens.runId,
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
  if (row.runCompanyId !== null) {
    if (row.runCompanyId !== row.companyId || !ACTIVE_RUN_STATUSES.has(row.runStatus ?? "")) return null;
  }
  return { companyId: row.companyId, runId: row.runId };
}

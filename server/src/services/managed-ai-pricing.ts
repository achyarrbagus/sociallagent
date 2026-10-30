import { and, eq, sql } from "drizzle-orm";
import { instanceSettings, toolConnections, type Db } from "@paperclipai/db";
import { managedAiModelPolicySchema, type ManagedAiBilling } from "@paperclipai/shared";

/** The managed gateway's connection names; kept in step with managed-gateway.ts. */
const MANAGED_CONNECTION_NAMES = ["9Router (Claude)", "9Router (Codex)"];

/** True for the name of a company's managed 9Router connection. */
export function isManagedGatewayConnectionName(name: unknown): boolean {
  return typeof name === "string" && MANAGED_CONNECTION_NAMES.includes(name);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tokens(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Admin rates for SocialAgent AI, or the schema defaults when none were saved. */
export async function readManagedAiBilling(db: Pick<Db, "select">): Promise<ManagedAiBilling> {
  const [row] = await db.select({ aiModels: instanceSettings.aiModels }).from(instanceSettings)
    .where(eq(instanceSettings.singletonKey, "default"));
  const parsed = managedAiModelPolicySchema.safeParse(row?.aiModels ?? {});
  return (parsed.success ? parsed.data : managedAiModelPolicySchema.parse({})).billing;
}

/**
 * Price for one run's tokens at the admin's rates, in USD. Usage follows the
 * exclusive-input contract: inputTokens excludes cache reads, which
 * cachedInputTokens counts separately and may exceed inputTokens.
 */
export function managedAiCostUsd(billing: ManagedAiBilling, usage: Record<string, unknown>) {
  const cents = tokens(usage.inputTokens) * billing.inputCentsPerMillionTokens / 1_000_000
    + tokens(usage.cachedInputTokens) * billing.cachedInputCentsPerMillionTokens / 1_000_000
    + tokens(usage.outputTokens) * billing.outputCentsPerMillionTokens / 1_000_000;
  return cents / 100;
}

/**
 * When a run used the operator's managed 9Router connection, its cost is the
 * admin rate card applied to its tokens. Gateway model ids are unknown to the
 * provider price tables, and the CLI may report a subscription, so neither
 * the adapter's figure nor the built-in rate cards apply. Returns null for any
 * other run, which keeps its normal accounting.
 */
export async function managedRunPricing(
  db: Pick<Db, "select">,
  run: { companyId: string; contextSnapshot: unknown; usageJson: unknown },
): Promise<{ costUsd: number; billingType: "metered_api" } | null> {
  if (!process.env.SOCIALAGENT_9ROUTER_API_KEY?.trim()) return null;
  const binding = record(record(run.contextSnapshot).aiConnection);
  const connectionId = typeof binding.connectionId === "string" ? binding.connectionId : null;
  if (!connectionId) return null;
  const [connection] = await db.select({ id: toolConnections.id }).from(toolConnections).where(and(
    eq(toolConnections.id, connectionId),
    eq(toolConnections.companyId, run.companyId),
    sql`${toolConnections.name} in (${MANAGED_CONNECTION_NAMES[0]}, ${MANAGED_CONNECTION_NAMES[1]})`,
  ));
  if (!connection) return null;
  const billing = await readManagedAiBilling(db);
  return { costUsd: managedAiCostUsd(billing, record(run.usageJson)), billingType: "metered_api" };
}

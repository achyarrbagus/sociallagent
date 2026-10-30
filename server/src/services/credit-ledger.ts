import { and, eq, gte, lt, sql } from "drizzle-orm";
import { companyCreditCharges, companyCreditPolicies, instanceCreditSettings, heartbeatRuns, toolConnections, type Db } from "@paperclipai/db";
import { calculateCreditMicrounits } from "./credit-pricing.js";
import { withAccountingTransaction } from "./accounting-transaction.js";

export const DEFAULT_CREDIT_RATES = { input: 1_000_000, cachedInput: 100_000, output: 5_000_000 };
export const DEFAULT_CREDIT_ALLOWANCE = 1_000_000_000n;
function windowFor(now: Date) {
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}
export async function creditBalance(db: Db, companyId: string, now = new Date()) {
  const window = windowFor(now);
  const [policy] = await db.select().from(companyCreditPolicies).where(eq(companyCreditPolicies.companyId, companyId));
  const [defaults] = await db.select().from(instanceCreditSettings).where(eq(instanceCreditSettings.singletonKey, "default"));
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${companyCreditCharges.amountMicrounits}), 0)::text` }).from(companyCreditCharges).where(and(eq(companyCreditCharges.companyId, companyId), gte(companyCreditCharges.occurredAt, window.start), lt(companyCreditCharges.occurredAt, window.end)));
  const allowance = policy?.allowanceMicrounits ?? defaults?.allowanceMicrounits ?? DEFAULT_CREDIT_ALLOWANCE;
  const spent = BigInt(row?.total ?? "0");
  return { allowanceMicrounits: allowance.toString(), spentMicrounits: spent.toString(), remainingMicrounits: (allowance > spent ? allowance - spent : 0n).toString(), periodStart: window.start.toISOString(), periodEnd: window.end.toISOString(), rates: policy?.rates ?? defaults?.rates ?? DEFAULT_CREDIT_RATES };
}
/** Call while holding the company accounting lock before starting new work. */
export async function creditAdmission(db: Db, companyId: string) {
  const balance = await creditBalance(db, companyId);
  return { allowed: BigInt(balance.remainingMicrounits) > 0n, rates: balance.rates };
}

/** A caller cannot select a different organization's connection to avoid metering. */
export async function managedCreditAdmission(tx: Db, run: typeof heartbeatRuns.$inferSelect) {
  if (!process.env.SOCIALAGENT_9ROUTER_API_KEY?.trim()) return null;
  const baseUrl = process.env.SOCIALAGENT_9ROUTER_BASE_URL?.trim() || "https://9router.amifish.com/v1";
  const context = run.contextSnapshot as Record<string, unknown> | null;
  const binding = context?.aiConnection as Record<string, unknown> | undefined;
  const id = typeof binding?.connectionId === "string" ? binding.connectionId : null;
  if (!id) return null;
  const [connection] = await tx.select({ name: toolConnections.name }).from(toolConnections).where(and(
    eq(toolConnections.id, id), eq(toolConnections.companyId, run.companyId), eq(toolConnections.connectionPurpose, "ai"),
    sql`${toolConnections.config}->'ai'->'routing'->>'baseUrl' = ${baseUrl}`,
  ));
  if (!connection || !["9Router (Codex)", "9Router (Claude)"].includes(connection.name)) return null;
  return creditAdmission(tx, run.companyId);
}

export type CreditUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export type CreditRates = { input: number; cachedInput: number; output: number };

/** Caller holds the company accounting lock. A conflicting replay aborts the transaction. */
export async function recordCreditUsageInTransaction(tx: Db, companyId: string, runId: string, usage: CreditUsage, rates: CreditRates, occurredAt: Date): Promise<void> {
  const amount = calculateCreditMicrounits(usage, rates);
  const [inserted] = await tx.insert(companyCreditCharges).values({ companyId, runId, amountMicrounits: amount, inputTokens: BigInt(usage.inputTokens), cachedInputTokens: BigInt(usage.cachedInputTokens), outputTokens: BigInt(usage.outputTokens), rates, occurredAt }).onConflictDoNothing({ target: [companyCreditCharges.companyId, companyCreditCharges.runId] }).returning();
  if (!inserted) {
    const [existing] = await tx.select().from(companyCreditCharges).where(and(eq(companyCreditCharges.companyId, companyId), eq(companyCreditCharges.runId, runId)));
    if (!existing || existing.inputTokens !== BigInt(usage.inputTokens) || existing.cachedInputTokens !== BigInt(usage.cachedInputTokens) || existing.outputTokens !== BigInt(usage.outputTokens)) throw new Error("Credit usage conflict for existing run");
  }
}

export async function recordCreditUsage(db: Db, companyId: string, runId: string, usage: CreditUsage): Promise<void> {
  await withAccountingTransaction(db, companyId, async tx => {
    const [run] = await tx.select({ id: heartbeatRuns.id, finishedAt: heartbeatRuns.finishedAt }).from(heartbeatRuns).where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId)));
    if (!run) throw new Error("Run not found in organization");
    const balance = await creditBalance(tx, companyId);
    await recordCreditUsageInTransaction(tx, companyId, runId, usage, balance.rates, run.finishedAt ?? new Date());
  });
}

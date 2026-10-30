import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { agents, heartbeatRuns, companies, companyCreditPolicies, instanceCreditSettings, toolApplications, toolConnections, createDb, getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { creditBalance, recordCreditUsage, creditAdmission, managedCreditAdmission } from "./credit-ledger.js";
import { reserveRunBudget, recheckRunBudgetReservationInTransaction } from "./budget-reservations.js";
import { withAccountingTransaction } from "./accounting-transaction.js";
import { eq } from "drizzle-orm";
import { accountRunCost } from "./run-cost-accounting.js";

const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("credit ledger", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("credit-ledger-"); db = createDb(temporary.connectionString); }, 60_000);
  afterAll(async () => { await db?.$client.end(); await temporary?.cleanup(); });
  it("recognizes only managed organization connections for credit admission", async () => {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", "fixture");
    try {
      const [company, other] = await db.insert(companies).values([{ name: "Managed", issuePrefix: "CRM" }, { name: "Other", issuePrefix: "CRO" }]).returning();
      const [app] = await db.insert(toolApplications).values({ companyId: company.id, name: "Gateway", type: "mcp_http" }).returning();
      const [connection] = await db.insert(toolConnections).values({ companyId: company.id, applicationId: app.id, name: "9Router (Codex)", uid: randomUUID(), connectionPurpose: "ai", transport: "runtime_auth", config: { ai: { routing: { baseUrl: "https://9router.amifish.com/v1" } } } }).returning();
      const [agent] = await db.insert(agents).values({ companyId: company.id, name: "Managed agent" }).returning();
      const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id, contextSnapshot: { aiConnection: { connectionId: connection.id } } }).returning();
      expect(await managedCreditAdmission(db, run)).toMatchObject({ allowed: true, rates: { input: 1000000 } });
      expect(await managedCreditAdmission(db, { ...run, companyId: other.id })).toBeNull();
      await db.insert(companyCreditPolicies).values({ companyId: company.id, allowanceMicrounits: 0n, rates: { input: 1000000, cachedInput: 100000, output: 5000000 } });
      await expect(reserveRunBudget(db, company.id, run.id, null)).rejects.toThrow(/credit/i);
      await db.update(companyCreditPolicies).set({ allowanceMicrounits: 1000000n }).where(eq(companyCreditPolicies.companyId, company.id));
      const reservation = await reserveRunBudget(db, company.id, run.id, null);
      const [reservedRun] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run.id));
      expect(reservedRun.usageJson?.creditRatesSnapshot).toEqual({ input: 1000000, cachedInput: 100000, output: 5000000 });
      await db.update(companyCreditPolicies).set({ allowanceMicrounits: 0n }).where(eq(companyCreditPolicies.companyId, company.id));
      const blocked = await withAccountingTransaction(db, company.id, (tx, events) => recheckRunBudgetReservationInTransaction(tx, events, reservedRun, reservation.id));
      expect(blocked).toMatch(/credit/i);
    } finally { vi.unstubAllEnvs(); }
  });

  it("charges a managed run from its final receipt and blocks the next run", async () => {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", "fixture");
    try {
      const [company] = await db.insert(companies).values({ name: "Credit journey", issuePrefix: "CRJ" }).returning();
      const [app] = await db.insert(toolApplications).values({ companyId: company.id, name: "Gateway", type: "mcp_http" }).returning();
      const [connection] = await db.insert(toolConnections).values({ companyId: company.id, applicationId: app.id, name: "9Router (Codex)", uid: randomUUID(), connectionPurpose: "ai", transport: "runtime_auth", config: { ai: { routing: { baseUrl: "https://9router.amifish.com/v1" } } } }).returning();
      const [agent] = await db.insert(agents).values({ companyId: company.id, name: "Agent" }).returning();
      await db.insert(companyCreditPolicies).values({ companyId: company.id, allowanceMicrounits: 1000000n, rates: { input: 1000000, cachedInput: 100000, output: 5000000 } });
      const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id, contextSnapshot: { aiConnection: { connectionId: connection.id } } }).returning();
      await reserveRunBudget(db, company.id, run.id, null);
      const [reserved] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run.id));
      await db.update(heartbeatRuns).set({ status: "succeeded", finishedAt: new Date(), usageJson: { ...reserved.usageJson, accountingReceiptReady: true, provider: "test", model: "test", billingType: "metered_api", costUsd: 0.01, inputTokens: 2000, cachedInputTokens: 500, outputTokens: 1000 } }).where(eq(heartbeatRuns.id, run.id));
      expect(await accountRunCost(db, run.id)).toBe(true);
      expect(await accountRunCost(db, run.id)).toBe(false);
      expect(await creditBalance(db, company.id)).toMatchObject({ spentMicrounits: "6550000", remainingMicrounits: "0" });
      const [next] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id, contextSnapshot: { aiConnection: { connectionId: connection.id } } }).returning();
      await expect(reserveRunBudget(db, company.id, next.id, null)).rejects.toThrow(/credit/i);
    } finally { vi.unstubAllEnvs(); }
  });

  it("uses admin defaults while allowing a company override", async () => {
    const [company] = await db.insert(companies).values({ name: "Default credit", issuePrefix: "CRD" }).returning();
    await db.insert(instanceCreditSettings).values({ singletonKey: "default", allowanceMicrounits: 2000000n, rates: { input: 2000, cachedInput: 1000, output: 3000 } }).onConflictDoUpdate({ target: instanceCreditSettings.singletonKey, set: { allowanceMicrounits: 2000000n, rates: { input: 2000, cachedInput: 1000, output: 3000 } } });
    expect(await creditBalance(db, company.id)).toMatchObject({ allowanceMicrounits: "2000000", rates: { input: 2000 } });
    await db.insert(companyCreditPolicies).values({ companyId: company.id, allowanceMicrounits: 3000000n, rates: { input: 4000, cachedInput: 1000, output: 3000 } });
    expect(await creditBalance(db, company.id)).toMatchObject({ allowanceMicrounits: "3000000", rates: { input: 4000 } });
    await db.delete(instanceCreditSettings);
  });

  it("rejects new runs when the allowance is depleted while preserving distinct organizations", async () => {
    const [company] = await db.insert(companies).values({ name: "Exhausted", issuePrefix: "CRE" }).returning();
    await db.insert(companyCreditPolicies).values({ companyId: company.id, allowanceMicrounits: 0n, rates: { input: 1000000, cachedInput: 100000, output: 5000000 } });
    expect(await creditAdmission(db, company.id)).toMatchObject({ allowed: false });
  });

  it("records a run once and isolates organizations", async () => {
    const [first, second] = await db.insert(companies).values([{ name: "Credit A", issuePrefix: "CRA" }, { name: "Credit B", issuePrefix: "CRB" }]).returning();
    const [agent] = await db.insert(agents).values({ companyId: first.id, name: "Credit agent" }).returning();
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId: first.id, agentId: agent.id, status: "succeeded" });
    const usage = { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 1000 };
    await recordCreditUsage(db, first.id, runId, usage);
    await recordCreditUsage(db, first.id, runId, usage);
    await expect(recordCreditUsage(db, first.id, runId, { ...usage, outputTokens: 1001 })).rejects.toThrow(/conflict/i);
    await expect(recordCreditUsage(db, second.id, runId, usage)).rejects.toThrow(/not found/i);
    expect(await creditBalance(db, first.id)).toMatchObject({ spentMicrounits: "7000000", allowanceMicrounits: "1000000000" });
    expect(await creditBalance(db, second.id)).toMatchObject({ spentMicrounits: "0" });
    expect(await creditBalance(db, first.id, new Date("2035-01-05T00:00:00Z"))).toMatchObject({ spentMicrounits: "0" });
    await db.delete(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect((await creditBalance(db, first.id)).spentMicrounits).toBe("7000000");
  });
});

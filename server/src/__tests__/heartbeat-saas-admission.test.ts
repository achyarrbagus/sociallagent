import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog, agents, agentRuntimeState, agentWakeupRequests, companies, costEvents, createDb,
  environmentLeases, heartbeatRunEvents, heartbeatRuns, issues,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { drainHeartbeatRunsToQuiescence } from "./helpers/drain-heartbeat-runs.js";
import { heartbeatService } from "../services/heartbeat.ts";

const support = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = support.supported ? describe : describe.skip;

describeEmbeddedPostgres("heartbeat SaaS admission", () => {
  let db!: ReturnType<typeof createDb>;
  let heartbeat!: ReturnType<typeof heartbeatService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("heartbeat-saas-admission-");
    db = createDb(tempDb.connectionString);
    heartbeat = heartbeatService(db);
  }, 60_000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await drainHeartbeatRunsToQuiescence(db, heartbeat);
    await db.delete(activityLog);
    await db.delete(heartbeatRunEvents);
    await db.delete(costEvents);
    await db.delete(environmentLeases);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(issues);
    await db.delete(agentRuntimeState);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => { await tempDb?.cleanup(); });

  it("fails a pre-existing process agent's run at admission with no process, lease, or held lock", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID();
    const issuePrefix = `S${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    await db.insert(companies).values({ id: companyId, name: "Saas", issuePrefix, requireBoardApprovalForNewAgents: false, defaultResponsibleUserId: "responsible-user" });
    await db.insert(agents).values({ id: agentId, companyId, name: "Proc", role: "engineer", status: "idle", adapterType: "process", adapterConfig: { command: "echo" }, runtimeConfig: {}, permissions: {} });
    await db.insert(issues).values({ id: issueId, companyId, title: "Work", status: "todo", priority: "medium", assigneeAgentId: agentId, issueNumber: 1, identifier: `${issuePrefix}-1` });

    await heartbeat.wakeup(agentId, {
      source: "automation", triggerDetail: "system", reason: "issue_assigned",
      payload: { issueId }, contextSnapshot: { issueId, taskId: issueId, wakeReason: "issue_assigned" },
      requestedByActorType: "user", requestedByActorId: "local-board",
    });
    await drainHeartbeatRunsToQuiescence(db, heartbeat);

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("failed");
    expect(runs[0]!.error).toContain("This agent type cannot run in SaaS mode");
    expect(runs[0]!.processPid).toBeNull();
    expect(await db.select().from(environmentLeases)).toEqual([]);
    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(issue!.executionRunId).toBeNull();
    expect(issue!.executionLockedAt).toBeNull();
  });
});

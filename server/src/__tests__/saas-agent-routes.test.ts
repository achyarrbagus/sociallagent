import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, agentRuntimeState, activityLog, approvals, companies, companyMemberships, createDb, heartbeatRuns, principalPermissionGrants } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { agentRoutes } from "../routes/agents.js";

const support = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = support.supported ? describe : describe.skip;
type Db = ReturnType<typeof createDb>;
const MESSAGE = "This agent type cannot run in SaaS mode";

function appFor(db: Db, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.actor = actor; next(); });
  app.use("/api", agentRoutes(db));
  app.use(errorHandler);
  return app;
}

describeEmbeddedPostgres("SaaS mode refuses host-executing agents on hire and patch", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-saas-agent-routes-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete(activityLog);
    await db.delete(approvals);
    await db.delete(heartbeatRuns);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(agentRuntimeState);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => { await tempDb?.cleanup(); });

  async function seed() {
    const nonce = randomUUID().slice(0, 8);
    const [company] = await db.insert(companies).values({
      name: `Saas Co ${nonce}`, issuePrefix: `SA${nonce.slice(0, 4).toUpperCase()}`,
      defaultResponsibleUserId: "board-user", requireBoardApprovalForNewAgents: false,
    }).returning();
    const [existing] = await db.insert(agents).values({
      companyId: company!.id, name: "Existing", role: "general", adapterType: "codex_local",
      adapterConfig: {}, runtimeConfig: {}, permissions: { canCreateAgents: true },
    }).returning();
    const [run] = await db.insert(heartbeatRuns).values({ companyId: company!.id, agentId: existing!.id, status: "running", contextSnapshot: {} }).returning();
    return { company: company!, existing: existing!, run: run! };
  }

  it.each(["agent-hires", "agents"])("rejects a process-adapter hire via %s with 422", async (endpoint) => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const { company, existing, run } = await seed();
    const app = appFor(db, { type: "agent", agentId: existing.id, companyId: company.id, runId: run.id, source: "agent_jwt" });
    const res = await request(app).post(`/api/companies/${company.id}/${endpoint}`)
      .send({ name: "Proc", role: "engineer", adapterType: "process" });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(JSON.stringify(res.body)).toContain(MESSAGE);
  });

  it("rejects patching an existing agent to engine cli with 422", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const { company, existing } = await seed();
    const app = appFor(db, { type: "board", userId: "board-user", source: "local_implicit", isInstanceAdmin: true, companyIds: [company.id] });
    const res = await request(app).patch(`/api/agents/${existing.id}`).send({ adapterConfig: { engine: "cli" } });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(JSON.stringify(res.body)).toContain(MESSAGE);
  });

  it("still accepts a process-adapter hire outside SaaS mode", async () => {
    const { company, existing, run } = await seed();
    const app = appFor(db, { type: "agent", agentId: existing.id, companyId: company.id, runId: run.id, source: "agent_jwt" });
    const res = await request(app).post(`/api/companies/${company.id}/agent-hires`)
      .send({ name: "Proc", role: "engineer", adapterType: "process" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });
});

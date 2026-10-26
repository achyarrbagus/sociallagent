import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityLog, agencyBrands, agencyClients, agents, assets, companies, companyMemberships, createDb, issueAttachments, issues, projects } from "@paperclipai/db";
import { agencyContentRoutes } from "../routes/agency-content.js";
import { agencyRoutes } from "../routes/agency.js";
import { errorHandler } from "../middleware/error-handler.js";
import { projectService } from "../services/projects.js";
import { deleteCompany } from "../services/company-deletion.js";
import { lockAgencyContentCompany } from "../services/agency-content-lifecycle.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;
suite("agency content production and owner decisions", () => {
  let db: ReturnType<typeof createDb>;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let sequence = 0;
  beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase("paperclip-agency-content-"); db = createDb(database.connectionString); }, 60_000);
  afterAll(async () => { await database?.cleanup(); });

  async function fixture() {
    const [company] = await db.insert(companies).values({ name: "Agency", issuePrefix: `AC${++sequence}` }).returning();
    const companyId = company.id;
    const [client] = await db.insert(agencyClients).values({ companyId, name: "Client" }).returning();
    const [brand] = await db.insert(agencyBrands).values({ companyId, clientId: client.id, name: "Coffee" }).returning();
    const [project] = await db.insert(projects).values({ companyId, brandId: brand.id, name: "Campaign" }).returning();
    const [agent] = await db.insert(agents).values({ companyId, name: "Copywriter", role: "general" }).returning();
    const [task] = await db.insert(issues).values({ companyId, projectId: project.id, title: "Write coffee story", status: "todo", assigneeAgentId: agent.id }).returning();
    await db.insert(companyMemberships).values([{ companyId, principalType: "user", principalId: "owner", membershipRole: "owner" }, { companyId, principalType: "user", principalId: "other", membershipRole: "operator" }]);
    function app(mode = "owner") {
      const app = express();
      app.use(express.json(), (req, _res, next) => {
        req.actor = mode === "agent" ? { type: "agent", source: "agent_key", companyId, agentId: agent.id }
          : mode === "owner" ? { type: "board", source: "local_implicit", userId: "owner" }
          : { type: "board", source: "session", userId: mode === "stale-owner" ? "owner" : "other", companyIds: [companyId], memberships: [{ companyId, membershipRole: mode === "stale-owner" ? "owner" : "operator", status: "active" }] };
        next();
      });
      app.use("/api", agencyContentRoutes(db), agencyRoutes(db)); app.use(errorHandler);
      return app;
    }
    const base = `/api/companies/${companyId}/content-items`;
    async function create() {
      const result = await request(app()).post(base).send({ brandId: brand.id, projectId: project.id, title: "Coffee story", idea: "Meet the farmer" });
      expect(result.status).toBe(201);
      return result.body;
    }
    return { companyId, client, brand, project, agent, task, app, base, create };
  }

  it("moves idea through owner selection, production, final approval, then invalidates on a new revision", async () => {
    const f = await fixture(); const created = await f.create(); const path = `${f.base}/${created.id}`;
    expect(created.status).toBe("idea");
    expect((await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" })).body.status).toBe("in_production");
    expect((await request(f.app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: f.task.id, role: "copywriting" })).status).toBe(200);
    const revision = await request(f.app("agent")).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Coffee story", caption: "Meet our farmer", format: "image", targetAccount: "@coffee" });
    expect(revision.status).toBe(201); expect(revision.body.revisionNumber).toBe(2);
    expect((await request(f.app("agent")).post(`${path}/submit`).send({ expectedRevisionNumber: 2 })).body.status).toBe("awaiting_owner");
    const approved = await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 2, decision: "approve" });
    expect(approved.status).toBe(200); expect(approved.body.approvalValid).toBe(true);
    const next = await request(f.app("agent")).post(`${path}/revisions`).send({ expectedRevisionNumber: 2, title: "Coffee story", caption: "A changed caption", targetAccount: "@different" });
    expect(next.status).toBe(201); expect(next.body.status).toBe("in_production"); expect(next.body.approvedRevisionNumber).toBeNull();
    const old = await request(f.app()).get(`${path}/revisions/2`);
    expect(old.body.caption).toBe("Meet our farmer"); expect(old.body.targetAccount).toBe("@coffee");
    expect(old.body.decisions.some((d: { decision: string }) => d.decision === "approve")).toBe(true);
  });

  it("denies agent self-approval, non-owner writes, and stale owner membership", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    for (const mode of ["agent", "other"]) {
      expect((await request(f.app(mode)).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" })).status).toBe(403);
    }
    expect((await request(f.app("agent")).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Unauthorized" })).status).toBe(403);
    await db.update(companyMemberships).set({ status: "inactive" }).where(and(eq(companyMemberships.companyId, f.companyId), eq(companyMemberships.principalId, "owner")));
    expect((await request(f.app("stale-owner")).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" })).status).toBe(403);
  });

  it("rejects stale edits and serializes simultaneous owner approvals", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" });
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Coffee", caption: "Caption" });
    expect((await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Stale" })).status).toBe(409);
    await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 2 });
    const decisions = await Promise.all([1, 2].map(() => request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 2, decision: "approve" })));
    expect(decisions.map(d => d.status).sort()).toEqual([200, 409]);
    const audit = await db.select().from(activityLog).where(and(eq(activityLog.entityId, c.id), eq(activityLog.action, "agency.content.approve")));
    expect(audit).toHaveLength(1);
  });

  it("retains source privacy and rejects cross-company or mismatched campaign links", async () => {
    const f = await fixture(); const other = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    expect((await request(f.app()).post(f.base).send({ brandId: other.brand.id, projectId: f.project.id, title: "Wrong brand" })).status).toBe(422);
    expect((await request(f.app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: other.task.id, role: "design" })).status).toBe(422);
    await db.update(issues).set({ visibility: "private", createdByUserId: "owner", assigneeAgentId: null }).where(eq(issues.id, f.task.id));
    expect((await request(f.app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: f.task.id, role: "design" })).status).toBe(200);
    expect((await request(f.app("other")).get(path)).status).toBe(404);
    expect((await request(f.app("other")).get(f.base)).body.items).toEqual([]);
    await db.delete(issues).where(eq(issues.id, f.task.id));
    expect((await request(f.app()).get(path)).status).toBe(404);
  });

  it("snapshots real attachments and refuses missing assets or changed brand context at approval", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" });
    await request(f.app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: f.task.id, role: "design" });
    const [asset] = await db.insert(assets).values({ companyId: f.companyId, provider: "local", objectKey: `${f.companyId}/assets/issues/${f.task.id}/visual.png`, sha256: "a".repeat(64), byteSize: 10, contentType: "image/png", originalFilename: "visual.png" }).returning();
    const [attachment] = await db.insert(issueAttachments).values({ companyId: f.companyId, issueId: f.task.id, assetId: asset.id }).returning();
    const revision = await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Visual", attachmentIds: [attachment.id] });
    expect(revision.status).toBe(201); expect(revision.body.currentRevision.assets[0].sha256).toBe("a".repeat(64));
    await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 2 });
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 2, decision: "approve" });
    await request(f.app()).patch(`/api/companies/${f.companyId}/agency/brands/${f.brand.id}`).send({ toneOfVoice: "New guidelines" });
    const stale = await request(f.app()).get(path);
    expect(stale.body.approvalValid).toBe(false); expect(stale.body.status).toBe("changes_requested");
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 2, title: "Refreshed visual", attachmentIds: [attachment.id] });
    await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 3 });
    await db.delete(assets).where(eq(assets.id, asset.id));
    expect((await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 3, decision: "approve" })).status).toBe(404);
  });

  it("does not lose an asset's private historical source when its database row is deleted", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    const [privateTask] = await db.insert(issues).values({ companyId: f.companyId, projectId: f.project.id, title: "Private research", visibility: "private", createdByUserId: "owner" }).returning();
    const [asset] = await db.insert(assets).values({ companyId: f.companyId, provider: "local", objectKey: `${f.companyId}/assets/issues/${privateTask.id}/private.png`, sha256: "b".repeat(64), byteSize: 10, contentType: "image/png" }).returning();
    const [attachment] = await db.insert(issueAttachments).values({ companyId: f.companyId, issueId: f.task.id, assetId: asset.id }).returning();
    await request(f.app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: f.task.id, role: "design" });
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Private visual", attachmentIds: [attachment.id] });
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 2, title: "Current text", caption: "Current" });
    expect((await request(f.app("other")).get(`${path}/revisions/2`)).status).toBe(404);
    await db.delete(assets).where(eq(assets.id, asset.id));
    expect((await request(f.app("other")).get(`${path}/revisions/2`)).status).toBe(404);
  });

  it("invalidates approval on client edits and does not revive it after campaign relinking", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" });
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Coffee", caption: "Caption" });
    await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 2 });
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 2, decision: "approve" });
    await request(f.app()).patch(`/api/companies/${f.companyId}/agency/clients/${f.client.id}`).send({ description: "New context" });
    const stale = await request(f.app()).get(path);
    expect(stale.body.approvalValid).toBe(false); expect(stale.body.contextCurrent).toBe(false);
    await request(f.app()).post(`${path}/revisions`).send({ expectedRevisionNumber: 2, title: "Refreshed", caption: "Caption" });
    await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 3 });
    await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 3, decision: "approve" });
    await projectService(db).update(f.project.id, { brandId: null });
    await projectService(db).update(f.project.id, { brandId: f.brand.id });
    expect((await request(f.app()).get(path)).body.approvalValid).toBe(false);
  });

  it("requires feedback for revisions and preserves history when rejecting an idea", async () => {
    const f = await fixture(); const c = await f.create(); const path = `${f.base}/${c.id}`;
    expect((await request(f.app()).post(`${path}/submit`).send({ expectedRevisionNumber: 1 })).status).toBe(409);
    expect((await request(f.app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "reject", note: "Not aligned with brand" })).body.status).toBe("rejected");
    const history = await request(f.app()).get(`${path}/revisions/1`);
    expect(history.body.idea).toBe("Meet the farmer");
    expect(history.body.decisions[0].note).toBe("Not aligned with brand");
  });

  it("lets a content operation finish before company deletion removes its source rows", async () => {
    const f = await fixture(); await f.create();
    // This standalone fixture has no lifecycle worker. Establish the existing
    // deletion precondition rather than exercising asynchronous agent shutdown.
    await db.update(agents).set({ status: "terminated", lifecycleState: "terminated" }).where(eq(agents.id, f.agent.id));
    let ready!: () => void; const acquired = new Promise<void>(resolve => { ready = resolve; });
    let release!: () => void; const released = new Promise<void>(resolve => { release = resolve; });
    const reading = db.transaction(async tx => {
      await lockAgencyContentCompany(tx as unknown as typeof db, f.companyId);
      ready(); await released;
      const [task] = await tx.select().from(issues).where(eq(issues.id, f.task.id)).for("share");
      expect(task?.id).toBe(f.task.id);
    });
    await acquired;
    const deleting = deleteCompany(db, f.companyId);
    await new Promise(resolve => setTimeout(resolve, 150));
    release(); await reading; await deleting;
    expect(await db.select().from(companies).where(eq(companies.id, f.companyId))).toHaveLength(0);
  });
});

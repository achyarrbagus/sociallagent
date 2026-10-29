import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyBrands, agencyClients, agencyPublications, agents, companies, companyMemberships, costEvents, createDb, issues, projects, routines, routineTriggers } from "@paperclipai/db";
import { agencyContentRoutes } from "../routes/agency-content.js";
import { agencyPublicationRoutes } from "../routes/agency-publications.js";
import { errorHandler } from "../middleware/error-handler.js";
import { oneOffCron } from "../services/agency-publications.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

it("builds a one-off cron in the brand's timezone", () => {
  // 2026-11-05 07:30 UTC is 14:30 in Jakarta (UTC+7).
  expect(oneOffCron(new Date("2026-11-05T07:30:00Z"), "Asia/Jakarta")).toBe("30 14 5 11 *");
  expect(oneOffCron(new Date("2026-11-05T23:05:00Z"), "UTC")).toBe("5 23 5 11 *");
});

const support = await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;
suite("agency content calendar", () => {
  let db: ReturnType<typeof createDb>;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let sequence = 0;
  beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase("paperclip-agency-publications-"); db = createDb(database.connectionString); }, 60_000);
  afterAll(async () => { await database?.cleanup(); });

  async function fixture() {
    const [company] = await db.insert(companies).values({ name: "Agency", issuePrefix: `AP${++sequence}`, requireBoardApprovalForNewAgents: false }).returning();
    const companyId = company!.id;
    const [client] = await db.insert(agencyClients).values({ companyId, name: "Client" }).returning();
    const [brand] = await db.insert(agencyBrands).values({ companyId, clientId: client!.id, name: "Coffee", timezone: "Asia/Jakarta" }).returning();
    const [project] = await db.insert(projects).values({ companyId, brandId: brand!.id, name: "Campaign" }).returning();
    const [writer] = await db.insert(agents).values({ companyId, name: "Copywriter", role: "general" }).returning();
    const [publisher] = await db.insert(agents).values({ companyId, name: "Publishing Coordinator", role: "general" }).returning();
    const [task] = await db.insert(issues).values({ companyId, projectId: project!.id, title: "Write", status: "todo", assigneeAgentId: writer!.id }).returning();
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "owner", membershipRole: "owner" });
    function app(mode: "owner" | "writer" | "publisher" = "owner") {
      const instance = express();
      instance.use(express.json(), (req, _res, next) => {
        req.actor = mode === "owner"
          ? { type: "board", source: "local_implicit", userId: "owner" }
          : { type: "agent", source: "agent_key", companyId, agentId: mode === "writer" ? writer!.id : publisher!.id } as never;
        next();
      });
      instance.use("/api", agencyContentRoutes(db), agencyPublicationRoutes(db));
      instance.use(errorHandler);
      return instance;
    }
    const content = `/api/companies/${companyId}/content-items`;
    const calendar = `/api/companies/${companyId}/agency/publications`;
    async function approvedContent() {
      const created = (await request(app()).post(content).send({ brandId: brand!.id, projectId: project!.id, title: "Coffee story", idea: "Meet the farmer" })).body;
      const path = `${content}/${created.id}`;
      await request(app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 1, decision: "select_idea" });
      await request(app()).post(`${path}/tasks`).send({ expectedRevisionNumber: 1, issueId: task!.id, role: "copywriting" });
      await request(app("writer")).post(`${path}/revisions`).send({ expectedRevisionNumber: 1, title: "Coffee story", caption: "Meet our farmer", format: "image", targetAccount: "@coffee" });
      await request(app("writer")).post(`${path}/submit`).send({ expectedRevisionNumber: 2 });
      const approved = await request(app()).post(`${path}/decisions`).send({ expectedRevisionNumber: 2, decision: "approve" });
      expect(approved.body.status).toBe("approved");
      return { id: created.id as string, path };
    }
    return { companyId, publisher: publisher!, app, calendar, approvedContent, content, project: project!, brand: brand!, task: task! };
  }

  const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it("schedules approved content for the publishing agent, lets it report the post, and lists it on the calendar", async () => {
    const f = await fixture();
    const item = await f.approvedContent();
    const scheduled = await request(f.app()).post(f.calendar).send({ contentId: item.id, platform: "instagram", accountLabel: "@coffee", scheduledAt: inAnHour() });
    expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(201);
    expect(scheduled.body).toMatchObject({ status: "scheduled", dispatch: "agent", caption: "Meet our farmer", approvalCurrent: true, agentId: f.publisher.id, brandName: "Coffee" });

    const [row] = await db.select().from(agencyPublications).where(eq(agencyPublications.id, scheduled.body.id));
    const [routine] = await db.select().from(routines).where(eq(routines.id, row!.routineId!));
    expect(routine).toMatchObject({ assigneeAgentId: f.publisher.id, status: "active" });
    expect(routine!.description).toContain(`/agency/publications/${row!.id}/complete`);
    const [trigger] = await db.select().from(routineTriggers).where(eq(routineTriggers.routineId, routine!.id));
    expect(trigger).toMatchObject({ kind: "schedule", timezone: "Asia/Jakarta", cronExpression: oneOffCron(row!.scheduledAt, "Asia/Jakarta") });

    // Another agent cannot report it; the assigned one can.
    const path = `${f.calendar}/${row!.id}`;
    expect((await request(f.app("writer")).post(`${path}/complete`).send({ status: "published" })).status).toBe(403);
    const done = await request(f.app("publisher")).post(`${path}/complete`).send({ status: "published", externalUrl: "https://instagram.com/p/abc" });
    expect(done.body).toMatchObject({ status: "published", externalUrl: "https://instagram.com/p/abc" });
    const [archived] = await db.select().from(routines).where(eq(routines.id, routine!.id));
    expect(archived!.status).toBe("archived");

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const listed = await request(f.app()).get(f.calendar).query({ from, to });
    expect(listed.body.map((entry: { id: string }) => entry.id)).toContain(row!.id);
  });

  it("refuses unapproved content and blocks a post whose approval changed", async () => {
    const f = await fixture();
    const draft = (await request(f.app()).post(f.content).send({ brandId: f.brand.id, projectId: f.project.id, title: "Draft", idea: "Not yet" })).body;
    expect((await request(f.app()).post(f.calendar).send({ contentId: draft.id, platform: "tiktok", scheduledAt: inAnHour(), dispatch: "manual" })).status).toBe(409);

    const item = await f.approvedContent();
    const manual = await request(f.app()).post(f.calendar).send({ contentId: item.id, platform: "linkedin", scheduledAt: inAnHour(), dispatch: "manual" });
    expect(manual.body).toMatchObject({ dispatch: "manual", agentId: null });
    // A new revision withdraws approval after scheduling.
    await request(f.app("writer")).post(`${item.path}/revisions`).send({ expectedRevisionNumber: 2, title: "Coffee story", caption: "Changed", format: "image" });
    const path = `${f.calendar}/${manual.body.id}`;
    expect((await request(f.app()).get(path)).body.approvalCurrent).toBe(false);
    expect((await request(f.app()).post(`${path}/complete`).send({ status: "published" })).status).toBe(409);
    const cancelled = await request(f.app()).post(`${path}/cancel`).send({});
    expect(cancelled.body.status).toBe("cancelled");
    expect((await request(f.app()).post(`${path}/cancel`).send({})).status).toBe(409);
  });

  it("only lets the owner schedule", async () => {
    const f = await fixture();
    const item = await f.approvedContent();
    const response = await request(f.app("writer")).post(f.calendar).send({ contentId: item.id, platform: "x", scheduledAt: inAnHour(), dispatch: "manual" });
    expect(response.status).toBe(403);
    const rows = await db.select().from(agencyPublications).where(and(eq(agencyPublications.companyId, f.companyId)));
    expect(rows).toHaveLength(0);
  });

  it("reports content, posts and AI cost per brand for a period", async () => {
    const f = await fixture();
    const item = await f.approvedContent();
    const scheduled = await request(f.app()).post(f.calendar).send({ contentId: item.id, platform: "tiktok", scheduledAt: inAnHour(), dispatch: "manual" });
    await request(f.app()).post(`${f.calendar}/${scheduled.body.id}/complete`).send({ status: "published", externalUrl: "https://tiktok.com/@coffee/video/1" });
    await db.insert(costEvents).values({
      companyId: f.companyId, agentId: f.publisher.id, projectId: f.project.id, provider: "anthropic", model: "claude", costCents: 1234, occurredAt: new Date(),
    } as never);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const report = await request(f.app()).get(`/api/companies/${f.companyId}/agency/reports/brands`).query({ from, to });
    expect(report.status, JSON.stringify(report.body)).toBe(200);
    expect(report.body).toEqual([expect.objectContaining({
      brandName: "Coffee",
      clientName: "Client",
      contentByStatus: { approved: 1 },
      approvedInPeriod: 1,
      posts: { scheduled: 0, published: 1, failed: 0, cancelled: 0 },
      publishedByPlatform: { tiktok: 1 },
      aiCostCents: 1234,
    })]);
    expect(report.body[0].recentPosts[0]).toMatchObject({ contentTitle: "Coffee story", externalUrl: "https://tiktok.com/@coffee/video/1" });
    expect((await request(f.app("writer")).get(`/api/companies/${f.companyId}/agency/reports/brands`).query({ from, to })).status).toBe(403);
  });
});

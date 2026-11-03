import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agencyBrands, agencyClients, agencyPublications, agencySocialAccounts, agents, companies, companyMemberships, costEvents, createDb, issues, projects, routines, routineTriggers } from "@paperclipai/db";
import { agencyContentRoutes } from "../routes/agency-content.js";
import { agencyPublicationRoutes } from "../routes/agency-publications.js";
import { errorHandler } from "../middleware/error-handler.js";
import { oneOffCron } from "../services/agency-publications.js";
import { agencyPublicationDispatchService } from "../services/social-publishing/dispatch.js";
import { socialAccountsService } from "../services/social-publishing/accounts.js";
import type { StorageService } from "../storage/types.js";
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

  it("automatically publishes due connector posts once and stops on an ambiguous provider result", async () => {
    const f = await fixture();
    const item = await f.approvedContent();
    const credentials = { pageId: "123456789012345", pageAccessToken: "opaque-facebook-page-token" };
    const account = await socialAccountsService(db, async () => Response.json({ id: credentials.pageId, name: "Coffee Page" }))
      .connect(f.companyId, f.brand.id, "facebook", credentials, "owner", { actorType: "user", actorId: "owner" });
    const scheduled = await request(f.app()).post(f.calendar).send({
      contentId: item.id, platform: "facebook", socialAccountId: account.id, scheduledAt: inAnHour(), dispatch: "connector",
    });
    expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(201);
    const [row] = await db.update(agencyPublications).set({ scheduledAt: new Date(Date.now() - 1_000) })
      .where(eq(agencyPublications.id, scheduled.body.id)).returning();
    expect(row!.routineId).toBeNull();

    const storage = { provider: "local_disk", getObject: vi.fn() } as unknown as StorageService;
    const providerFetch = vi.fn(async () => Response.json({ id: "123456789012345_987654321" }));
    const dispatcher = agencyPublicationDispatchService(db, storage, { fetchImpl: providerFetch });
    await Promise.all([dispatcher.sweepPending(), dispatcher.sweepPending()]);
    const [published] = await db.select().from(agencyPublications).where(eq(agencyPublications.id, row!.id));
    expect(published).toMatchObject({ status: "published", providerPostId: "123456789012345_987654321", externalUrl: "https://www.facebook.com/123456789012345_987654321", checkpoint: { finalSent: true } });
    expect(providerFetch).toHaveBeenCalledOnce();

    const uncertain = await request(f.app()).post(f.calendar).send({
      contentId: item.id, platform: "facebook", socialAccountId: account.id, scheduledAt: inAnHour(), dispatch: "connector",
    });
    const [uncertainRow] = await db.update(agencyPublications).set({ scheduledAt: new Date(Date.now() - 1_000) })
      .where(eq(agencyPublications.id, uncertain.body.id)).returning();
    const lostResponse = vi.fn(async () => { throw new Error("socket closed"); });
    const uncertainDispatcher = agencyPublicationDispatchService(db, storage, { fetchImpl: lostResponse });
    await uncertainDispatcher.sweepPending();
    await uncertainDispatcher.sweepPending();
    const [unknown] = await db.select().from(agencyPublications).where(eq(agencyPublications.id, uncertainRow!.id));
    expect(unknown).toMatchObject({ status: "unknown", failureReason: expect.stringContaining("Verify") });
    expect(lostResponse).toHaveBeenCalledOnce();
    expect(await uncertainDispatcher.hasPending()).toBe(false);

    const stale = await request(f.app()).post(f.calendar).send({
      contentId: item.id, platform: "facebook", socialAccountId: account.id, scheduledAt: inAnHour(), dispatch: "connector",
    });
    const [staleRow] = await db.update(agencyPublications).set({ scheduledAt: new Date(Date.now() - 1_000) })
      .where(eq(agencyPublications.id, stale.body.id)).returning();
    await request(f.app("writer")).post(`${item.path}/revisions`).send({
      expectedRevisionNumber: 2, title: "Coffee story", caption: "Updated after scheduling", format: "image",
    });
    const blockedProvider = vi.fn(async () => Response.json({ id: "must-not-send" }));
    await agencyPublicationDispatchService(db, storage, { fetchImpl: blockedProvider }).sweepPending();
    const [blocked] = await db.select().from(agencyPublications).where(eq(agencyPublications.id, staleRow!.id));
    expect(blocked!.status).toBe("failed");
    expect(blocked!.failureReason).toContain("approved revision or its brand, client, campaign, or company context changed");
    expect(blockedProvider).not.toHaveBeenCalled();
  });

  it("binds an approved publication only to an active account for its own brand and platform", async () => {
    const f = await fixture();
    const item = await f.approvedContent();
    const [account] = await db.insert(agencySocialAccounts).values({
      companyId: f.companyId,
      brandId: f.brand.id,
      platform: "x",
      displayName: "@coffee",
      externalAccountId: "123456789012345",
    }).returning();
    const scheduled = await request(f.app()).post(f.calendar).send({
      contentId: item.id,
      platform: "x",
      socialAccountId: account!.id,
      scheduledAt: inAnHour(),
      dispatch: "manual",
    });
    expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(201);
    expect(scheduled.body).toMatchObject({ socialAccountId: account!.id, socialAccountName: "@coffee", accountLabel: "@coffee" });

    const [linkedinAccount] = await db.insert(agencySocialAccounts).values({
      companyId: f.companyId,
      brandId: f.brand.id,
      platform: "linkedin",
      displayName: "Coffee Member",
      externalAccountId: "li-member-1",
    }).returning();
    const linkedinScheduled = await request(f.app()).post(f.calendar).send({
      contentId: item.id,
      platform: "linkedin",
      socialAccountId: linkedinAccount!.id,
      scheduledAt: inAnHour(),
      dispatch: "manual",
    });
    expect(linkedinScheduled.status, JSON.stringify(linkedinScheduled.body)).toBe(201);
    expect(linkedinScheduled.body).toMatchObject({ socialAccountId: linkedinAccount!.id, socialAccountName: "Coffee Member" });
    const wrongPlatform = await request(f.app()).post(f.calendar).send({
      contentId: item.id,
      platform: "linkedin",
      socialAccountId: account!.id,
      scheduledAt: inAnHour(),
      dispatch: "manual",
    });
    expect(wrongPlatform.status).toBe(422);

    const [otherBrand] = await db.insert(agencyBrands).values({ companyId: f.companyId, clientId: f.brand.clientId, name: "Other Brand" }).returning();
    const [foreignBrandAccount] = await db.insert(agencySocialAccounts).values({
      companyId: f.companyId,
      brandId: otherBrand!.id,
      platform: "x",
      displayName: "@other",
      externalAccountId: "987654321012345",
    }).returning();
    const mismatch = await request(f.app()).post(f.calendar).send({
      contentId: item.id,
      platform: "x",
      socialAccountId: foreignBrandAccount!.id,
      scheduledAt: inAnHour(),
      dispatch: "manual",
    });
    expect(mismatch.status).toBe(422);
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
      posts: { scheduled: 0, published: 1, failed: 0, unknown: 0, cancelled: 0 },
      publishedByPlatform: { tiktok: 1 },
      aiCostCents: 1234,
    })]);
    expect(report.body[0].recentPosts[0]).toMatchObject({ contentTitle: "Coffee story", externalUrl: "https://tiktok.com/@coffee/video/1" });
    expect((await request(f.app("writer")).get(`/api/companies/${f.companyId}/agency/reports/brands`).query({ from, to })).status).toBe(403);
  });
});

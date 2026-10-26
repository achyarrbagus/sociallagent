import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { activityLog, agencyBrands, companies, createDb } from "@paperclipai/db";
import { agencyRoutes } from "../routes/agency.js";
import { errorHandler } from "../middleware/error-handler.js";
import { projectService } from "../services/projects.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const suite = support.supported ? describe : describe.skip;

suite("agency owner operations and company boundaries", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let companyId: string;
  let otherCompanyId: string;
  let clientId: string;
  let brandId: string;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-agency-");
    db = createDb(database.connectionString);
    const rows = await db.insert(companies).values([
      { name: "Agency", issuePrefix: "AGY" }, { name: "Foreign", issuePrefix: "FRN" },
    ]).returning();
    [companyId, otherCompanyId] = rows.map(r => r.id);
  }, 60_000);
  afterAll(async () => { await database?.cleanup(); });

  function app(role = "owner", scope = companyId, actorType = "board") {
    const app = express();
    app.use(express.json(), (req, _res, next) => {
      req.actor = actorType === "agent"
        ? { type: "agent", source: "agent_key", agentId: randomUUID(), companyId: scope }
        : { type: "board", source: "local_implicit", userId: "owner" };
      // Authenticated members use an explicit membership, so non-owner writes
      // cannot accidentally inherit trusted-local authority.
      if (actorType === "board" && role !== "local") req.actor = {
        type: "board", source: "session", userId: "owner", companyIds: [scope],
        memberships: [{ companyId: scope, membershipRole: role, status: "active" }],
      } as typeof req.actor;
      next();
    });
    app.use("/api", agencyRoutes(db));
    app.use(errorHandler);
    return app;
  }
  const path = (suffix = "", company = companyId) => `/api/companies/${company}/agency${suffix}`;

  it("creates and edits clients and brand context with audited owner decisions", async () => {
    const client = await request(app()).post(path("/clients")).send({ name: "Client A", contactEmail: "contact@example.com" });
    expect(client.status).toBe(201);
    clientId = client.body.id;
    const brand = await request(app()).post(path("/brands")).send({ clientId, name: "Kopi", audience: "Coffee drinkers", toneOfVoice: "Friendly", brief: "Promote local coffee" });
    expect(brand.status).toBe(201);
    brandId = brand.body.id;
    expect(brand.body.companyId).toBe(companyId);
    const changed = await request(app()).patch(path(`/brands/${brandId}`)).send({ name: "Kopi Baru" });
    expect(changed.status).toBe(200);
    expect(changed.body.brief).toBe("Promote local coffee");
    const audit = await db.select().from(activityLog).where(eq(activityLog.entityId, brandId));
    expect(audit.map(r => r.action)).toEqual(expect.arrayContaining(["agency.brand.created", "agency.brand.updated"]));
  });

  it("lets agents read company context while denying agents and non-owners write access", async () => {
    const read = await request(app("owner", companyId, "agent")).get(path());
    expect(read.status).toBe(200);
    expect(read.body.canManage).toBe(false);
    expect(read.body.brands.some((b: { id: string }) => b.id === brandId)).toBe(true);
    for (const role of ["viewer", "operator", "admin"]) {
      expect((await request(app(role)).post(path("/clients")).send({ name: "Denied" })).status).toBe(403);
    }
    expect((await request(app("owner", companyId, "agent")).patch(path(`/brands/${brandId}`)).send({ name: "Denied" })).status).toBe(403);
  });

  it("returns a client error for malformed profile or company identifiers", async () => {
    expect((await request(app()).patch(path("/brands/not-a-uuid")).send({ name: "Invalid" })).status).toBe(400);
    expect((await request(app("local")).get(path("", "not-a-uuid"))).status).toBe(400);
  });

  it("rejects cross-company parents and hides foreign records", async () => {
    const result = await request(app("owner", otherCompanyId)).post(path("/brands", otherCompanyId)).send({ clientId, name: "Foreign link" });
    expect(result.status).toBe(422);
    expect((await request(app()).patch(path(`/brands/${brandId}`, otherCompanyId)).send({ name: "No" })).status).toBe(403);
    expect((await request(app("owner", otherCompanyId)).patch(path(`/brands/${brandId}`, otherCompanyId)).send({ name: "No" })).status).toBe(404);
    expect(await db.select().from(agencyBrands).where(eq(agencyBrands.companyId, otherCompanyId))).toHaveLength(0);
  });

  it("links campaigns only to active brands in the same company and supports clearing", async () => {
    const projects = projectService(db);
    const legacy = await projects.create(companyId, { name: "Legacy" });
    expect(legacy.brandId).toBeNull();
    const campaign = await projects.update(legacy.id, { brandId });
    expect(campaign?.brandId).toBe(brandId);
    await expect(projects.create(otherCompanyId, { name: "Invalid", brandId })).rejects.toMatchObject({ status: 422 });
    await expect(projects.update(legacy.id, { brandId: randomUUID() })).rejects.toMatchObject({ status: 422 });
    expect((await projects.update(legacy.id, { brandId: null }))?.brandId).toBeNull();
  });

  it("archives without losing history and prevents new work against archived clients", async () => {
    const projects = projectService(db);
    const campaign = await projects.create(companyId, { name: "Retained", brandId });
    expect((await request(app()).patch(path(`/clients/${clientId}`)).send({ archivedAt: new Date().toISOString() })).status).toBe(200);
    expect((await request(app()).post(path("/brands")).send({ clientId, name: "Blocked" })).status).toBe(422);
    await expect(projects.create(companyId, { name: "Blocked", brandId })).rejects.toMatchObject({ status: 422 });
    expect((await projects.update(campaign.id, { name: "Still readable" }))?.brandId).toBe(brandId);
    // Editing forms may resubmit an unchanged association. Historical context
    // remains editable; this must not be treated as creating new archived work.
    expect((await projects.update(campaign.id, { name: "Retained binding", brandId }))?.brandId).toBe(brandId);
    const directory = await request(app()).get(path());
    expect(directory.body.clients.find((c: { id: string }) => c.id === clientId).archivedAt).toBeTruthy();
    expect(directory.body.brands.some((b: { id: string }) => b.id === brandId)).toBe(true);
  });

  it("allows a brand form to retain its archived client while editing historical context", async () => {
    const edited = await request(app()).patch(path(`/brands/${brandId}`)).send({ clientId, name: "Archived context update" });
    expect(edited.status).toBe(200);
    expect(edited.body.clientId).toBe(clientId);
  });
});

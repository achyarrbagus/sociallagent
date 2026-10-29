import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activityLog, agents, connectionGrants, instanceSettings, toolConnections } from "@paperclipai/db";
import { agentRoutes } from "../routes/agents.js";
import { aiConnectionRoutes } from "../routes/ai-connections.js";
import { managedAiAdminRoutes } from "../routes/managed-ai-admin.js";
import { toolAccessRoutes } from "../routes/tool-access.js";
import { onboardingSeedRoutes } from "../routes/onboarding-seed.js";
import { managedGatewayService, managedHarnessOf, readManagedGatewayConfig } from "../services/managed-gateway.js";
import { coerceManagedAgentPatch } from "../routes/managed-ai-lock.js";
import {
  describeEmbeddedPostgres,
  routeApp,
  seedCompanyWithBoardAccess,
  type BoardActor,
  useEmbeddedPostgres,
} from "./helpers/route-test-harness.js";

const KEY = "sk-9router-test-key";

it("reads the managed gateway from the server environment", () => {
  expect(readManagedGatewayConfig({})).toBeNull();
  expect(readManagedGatewayConfig({ SOCIALAGENT_9ROUTER_API_KEY: "  " })).toBeNull();
  expect(readManagedGatewayConfig({ SOCIALAGENT_9ROUTER_API_KEY: KEY })).toEqual({
    apiKey: KEY,
    baseUrl: "https://9router.amifish.com/v1",
    defaultAdapterType: "claude_local",
    models: { claude_local: null, codex_local: null },
  });
  expect(readManagedGatewayConfig({
    SOCIALAGENT_9ROUTER_API_KEY: KEY,
    SOCIALAGENT_9ROUTER_BASE_URL: "http://localhost:20128/v1",
    SOCIALAGENT_9ROUTER_ADAPTER: "codex_local",
    SOCIALAGENT_9ROUTER_CODEX_MODEL: "gpt-5.5",
  })).toMatchObject({ baseUrl: "http://localhost:20128/v1", defaultAdapterType: "codex_local", models: { codex_local: "gpt-5.5" } });
});

it("keeps the adapter, model and AI connection when a locked caller patches an agent", () => {
  const binding = { provider: "anthropic", method: "api_key", mode: "shared", connectionId: "c", grantId: "g" };
  const existing = { adapterType: "claude_local", adapterConfig: { model: "claude-sonnet-5" }, runtimeConfig: { aiConnection: binding } };
  expect(coerceManagedAgentPatch(existing, {
    name: "Rina",
    adapterType: "process",
    adapterConfig: { model: "gpt-5.5", cwd: "/work" },
    runtimeConfig: { heartbeat: { enabled: false }, aiConnection: null },
  })).toEqual({
    name: "Rina",
    adapterType: "claude_local",
    adapterConfig: { model: "claude-sonnet-5", cwd: "/work" },
    runtimeConfig: { heartbeat: { enabled: false }, aiConnection: binding },
  });
  expect(coerceManagedAgentPatch(existing, { title: "Director" })).toEqual({ title: "Director" });
});

describeEmbeddedPostgres("onboarding managed 9Router gateway", () => {
  const ctx = useEmbeddedPostgres("onboarding-managed-gateway-route");
  let runnerSelectionSpy: { mockRestore(): void } | undefined;

  beforeEach(async () => {
    const selection = await import("../services/agent-runner-selection.js");
    runnerSelectionSpy = vi.spyOn(selection, "resolveNewAgentRunnerForCompany").mockImplementation(async (_db, _companyId, input) =>
      selection.resolveNewAgentRunner({ ...input, target: { driver: "local", platform: "linux", architecture: "x64" } }));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    runnerSelectionSpy?.mockRestore();
    await ctx.db.update(instanceSettings).set({ aiModels: {}, allowedConnectors: [] });
  });

  function enable() {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", KEY);
    vi.stubEnv("SOCIALAGENT_9ROUTER_BASE_URL", "http://localhost:20128/v1");
    vi.stubEnv("SOCIALAGENT_9ROUTER_CLAUDE_MODEL", "claude-sonnet-5-5");
  }

  async function seed() {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Managed gateway");
    return { ...seeded, app: routeApp(ctx.db, seeded.actor, onboardingSeedRoutes) };
  }

  it("reports a disabled gateway and refuses to connect without a configured key", async () => {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", "");
    const { app, companyId } = await seed();

    const status = await request(app).get(`/api/companies/${companyId}/onboarding/managed-gateway`);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ enabled: false, name: "9Router", defaultAdapterType: "claude_local", canManage: false });

    const ensure = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(ensure.status).toBe(422);
  });

  it("creates one shared connection for every agent and reuses it on replay", async () => {
    enable();
    const { app, companyId } = await seed();

    const status = await request(app).get(`/api/companies/${companyId}/onboarding/managed-gateway`);
    expect(status.body).toEqual({ enabled: true, name: "9Router", defaultAdapterType: "claude_local", canManage: false });
    expect(JSON.stringify(status.body)).not.toContain(KEY);

    const first = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      binding: { provider: "anthropic", method: "api_key", mode: "shared" },
      model: "claude-sonnet-5-5",
    });
    expect(JSON.stringify(first.body)).not.toContain(KEY);

    const replay = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(replay.body.binding).toEqual(first.body.binding);

    const connections = await ctx.db.select().from(toolConnections).where(and(
      eq(toolConnections.companyId, companyId), eq(toolConnections.connectionPurpose, "ai"),
    ));
    expect(connections).toHaveLength(1);
    expect(connections[0]!.config.ai).toMatchObject({
      provider: "anthropic",
      routing: { kind: "gateway", protocol: "messages", baseUrl: "http://localhost:20128/v1" },
    });
    const [grant] = await ctx.db.select().from(connectionGrants).where(eq(connectionGrants.connectionId, connections[0]!.id));
    expect(grant).toMatchObject({ kind: "organization", status: "active" });

    const logged = await ctx.db.select().from(activityLog).where(and(
      eq(activityLog.companyId, companyId), eq(activityLog.action, "ai_connection.connected"),
    ));
    expect(logged).toHaveLength(1);
  });

  it("keeps Claude and Codex on separate gateway protocols", async () => {
    enable();
    const { app, companyId } = await seed();

    const codex = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "codex_local" });
    expect(codex.body.binding.provider).toBe("openai");
    const claude = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(claude.body.binding.connectionId).not.toBe(codex.body.binding.connectionId);
  });

  it("refuses an agent actor", async () => {
    enable();
    const { companyId } = await seed();
    const agentActor = { type: "agent", agentId: "agent-1", companyId, source: "agent_key" };
    const app = routeApp(ctx.db, agentActor as unknown as BoardActor, onboardingSeedRoutes);

    const response = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(response.status).toBe(403);
    expect(await ctx.db.select().from(toolConnections).where(eq(toolConnections.companyId, companyId))).toHaveLength(0);
  });

  it("refuses a board user from another company", async () => {
    enable();
    const { companyId } = await seed();
    const other = await seed();

    const response = await request(other.app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    expect(response.status).toBe(403);
  });

  it("connects the agency specialists to the Director's shared connection", async () => {
    enable();
    const { app, companyId } = await seed();
    const ensure = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    const binding = ensure.body.binding;
    const [director] = await ctx.db.insert(agents).values({
      companyId,
      name: "Rina",
      role: "ceo",
      adapterType: "claude_local",
      adapterConfig: { model: "claude-sonnet-5-5" },
      runtimeConfig: { aiConnection: binding },
    }).returning();

    const install = await request(app).post(`/api/companies/${companyId}/onboarding/agency-team`).send({ agentId: director!.id });
    expect(install.body).toMatchObject({ status: "installed" });
    expect(install.body.agentIds).toHaveLength(11);

    const specialists = await ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
    for (const agent of specialists.filter((row) => row.id !== director!.id)) {
      expect(agent.runtimeConfig.aiConnection).toEqual(binding);
    }
  });

  function adminActor(companyId: string, userId: string): BoardActor {
    return {
      type: "board",
      source: "session",
      userId,
      companyIds: [companyId],
      memberships: [{ companyId, membershipRole: "owner", status: "active" }],
      isInstanceAdmin: true,
    };
  }

  it("locks AI connection changes for a company owner who is not an instance admin", async () => {
    enable();
    const { companyId, actor } = await seed();
    const app = routeApp(ctx.db, actor, aiConnectionRoutes);

    const response = await request(app).post(`/api/companies/${companyId}/ai-connections`).send({
      provider: "anthropic", method: "api_key", name: "My key", ownership: "personal", apiKey: "sk-own-key",
    });
    expect(response.status).toBe(403);
    expect(response.body.details).toMatchObject({ code: "ai_models_managed" });
  });

  it("forces a non-admin hire onto the managed adapter, role model and shared connection", async () => {
    enable();
    const { companyId, actor, app } = await seed();
    const ensure = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    const adminApp = routeApp(ctx.db, adminActor(companyId, actor.userId!), managedAiAdminRoutes);
    const policy = await request(adminApp).put("/api/instance/settings/ai-models").send({
      claude_local: { defaultModel: "claude-sonnet-5-5", roles: { designer: "claude-haiku-4-5" } },
    });
    expect(policy.status, JSON.stringify(policy.body)).toBe(200);

    const agentsApp = routeApp(ctx.db, actor, agentRoutes);
    const hire = await request(agentsApp).post(`/api/companies/${companyId}/agent-hires`).send({
      name: "Dina", role: "designer", adapterType: "codex_local", adapterConfig: { model: "gpt-5.5" },
    });
    expect(hire.status, JSON.stringify(hire.body)).toBeLessThan(300);
    const [row] = await ctx.db.select().from(agents).where(eq(agents.id, hire.body.agent.id));
    expect(managedHarnessOf(row!.adapterType, row!.adapterConfig), JSON.stringify({ adapterType: row!.adapterType, adapterConfig: row!.adapterConfig })).toBe("claude_local");
    expect(row!.adapterConfig).toMatchObject({ model: "claude-haiku-4-5" });
    expect(row!.runtimeConfig.aiConnection).toEqual(ensure.body.binding);
  });

  it("lets only an instance admin read and change the model policy, and applies it to managed agents", async () => {
    enable();
    const { companyId, actor, app } = await seed();
    const ensure = await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    const [director] = await ctx.db.insert(agents).values({
      companyId,
      name: "Rina",
      role: "ceo",
      adapterType: "claude_local",
      adapterConfig: { model: "claude-sonnet-5-5" },
      runtimeConfig: { aiConnection: ensure.body.binding },
    }).returning();
    const install = await request(app).post(`/api/companies/${companyId}/onboarding/agency-team`).send({ agentId: director!.id });
    expect(install.body).toMatchObject({ status: "installed" });

    const ownerApp = routeApp(ctx.db, actor, managedAiAdminRoutes);
    expect((await request(ownerApp).get("/api/instance/settings/ai-models")).status).toBe(403);
    expect((await request(ownerApp).put("/api/instance/settings/ai-models").send({})).status).toBe(403);

    const adminApp = routeApp(ctx.db, adminActor(companyId, actor.userId!), managedAiAdminRoutes);
    const updated = await request(adminApp).put("/api/instance/settings/ai-models").send({
      claude_local: { defaultModel: "claude-sonnet-5", roles: { ceo: "claude-opus-5", designer: "claude-haiku-4-5" } },
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.updatedAgents).toBeGreaterThan(0);
    expect(updated.body.settings.effective).toMatchObject({ ceo: "claude-opus-5", designer: "claude-haiku-4-5", general: "claude-sonnet-5" });
    expect(JSON.stringify(updated.body)).not.toContain(KEY);

    const rows = await ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
    for (const agent of rows) {
      const expected = agent.role === "ceo" ? "claude-opus-5" : agent.role === "designer" ? "claude-haiku-4-5" : "claude-sonnet-5";
      expect(agent.adapterConfig, `${agent.name} (${agent.role})`).toMatchObject({ model: expected });
      expect(agent.runtimeConfig.aiConnection).toEqual(ensure.body.binding);
    }

    const overview = await request(adminApp).get("/api/instance/ai-models/agents");
    expect(overview.status).toBe(200);
    expect(overview.body.filter((row: { companyId: string }) => row.companyId === companyId)).toHaveLength(12);
    expect(overview.body.every((row: { companyId: string; managed: boolean }) => row.companyId !== companyId || row.managed)).toBe(true);
  });

  it("moves existing agents onto SocialAgent AI and skips built-in ones", async () => {
    enable();
    const { companyId, actor } = await seed();
    const [legacy] = await ctx.db.insert(agents).values({
      companyId, name: "Old CEO", role: "ceo", adapterType: "codex_local", adapterConfig: { model: "gpt-5.5" }, runtimeConfig: {},
    }).returning();
    const [builtIn] = await ctx.db.insert(agents).values({
      companyId, name: "Helper", role: "general", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {},
      metadata: { paperclipBuiltInAgent: { key: "helper", featureKeys: [] } },
    }).returning();
    const adminApp = routeApp(ctx.db, adminActor(companyId, actor.userId!), managedAiAdminRoutes);
    await request(adminApp).put("/api/instance/settings/ai-models").send({ claude_local: { defaultModel: "claude-sonnet-5", roles: { ceo: "claude-opus-5" } } });

    const ownerApp = routeApp(ctx.db, actor, managedAiAdminRoutes);
    expect((await request(ownerApp).post("/api/instance/ai-models/adopt").send({})).status).toBe(403);

    const adopted = await request(adminApp).post("/api/instance/ai-models/adopt").send({});
    expect(adopted.status, JSON.stringify(adopted.body)).toBe(200);
    expect(adopted.body.failed).toEqual([]);
    const [moved] = await ctx.db.select().from(agents).where(eq(agents.id, legacy!.id));
    expect(managedHarnessOf(moved!.adapterType, moved!.adapterConfig)).toBe("claude_local");
    expect(moved!.adapterConfig).toMatchObject({ model: "claude-opus-5" });
    expect(moved!.runtimeConfig.aiConnection).toMatchObject({ mode: "shared", provider: "anthropic" });
    const [untouched] = await ctx.db.select().from(agents).where(eq(agents.id, builtIn!.id));
    expect(untouched!.adapterType).toBe("codex_local");
    expect(untouched!.runtimeConfig.aiConnection).toBeUndefined();
  });

  it("shows company users only the connectors an admin allowed", async () => {
    enable();
    const { companyId, actor } = await seed();
    const toolsApp = routeApp(ctx.db, actor, (db) => toolAccessRoutes(db));
    const gallery = async () => (await request(toolsApp).get(`/api/companies/${companyId}/tools/gallery`)).body.apps.map((app: { slug: string }) => app.slug);

    expect(await gallery()).toEqual([]);
    const blocked = await request(toolsApp).get(`/api/companies/${companyId}/tools/apps/slack/preflight`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.details).toMatchObject({ code: "connector_not_allowed" });

    const ownerAdmin = routeApp(ctx.db, actor, managedAiAdminRoutes);
    expect((await request(ownerAdmin).put("/api/instance/settings/connectors").send({ allowed: ["slack"] })).status).toBe(403);

    const adminApp = routeApp(ctx.db, adminActor(companyId, actor.userId!), managedAiAdminRoutes);
    const settings = await request(adminApp).get("/api/instance/settings/connectors");
    expect(settings.body.enforced).toBe(true);
    const slackSlug = settings.body.apps.find((app: { name: string }) => /slack/i.test(app.name))?.slug as string;
    expect(slackSlug).toBeTruthy();
    expect(settings.body.apps.some((app: { slug: string }) => app.slug === "anthropic")).toBe(false);
    const saved = await request(adminApp).put("/api/instance/settings/connectors").send({ allowed: [slackSlug, "not-a-connector"] });
    expect(saved.body.allowed).toEqual([slackSlug]);

    expect(await gallery()).toEqual([slackSlug]);
    // An admin still sees the whole catalog.
    const adminTools = routeApp(ctx.db, adminActor(companyId, actor.userId!), (db) => toolAccessRoutes(db));
    const adminGallery = await request(adminTools).get(`/api/companies/${companyId}/tools/gallery`);
    expect(adminGallery.body.apps.length).toBeGreaterThan(1);
  });

  it("moves only the given imported agents and creates the company connection for the importer", async () => {
    enable();
    const { companyId, actor } = await seed();
    const [imported, other] = await ctx.db.insert(agents).values([
      { companyId, name: "Imported", role: "designer", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {} },
      { companyId, name: "Existing", role: "general", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {} },
    ]).returning();

    const result = await managedGatewayService(ctx.db).adoptCompanyAgents(companyId, actor.userId!, [imported!.id]);
    expect(result).toMatchObject({ moved: 1, failed: [] });
    const [movedRow] = await ctx.db.select().from(agents).where(eq(agents.id, imported!.id));
    expect(movedRow!.runtimeConfig.aiConnection).toMatchObject({ mode: "shared" });
    const [otherRow] = await ctx.db.select().from(agents).where(eq(agents.id, other!.id));
    expect(otherRow!.runtimeConfig.aiConnection).toBeUndefined();
  });

  it("closes hidden agent settings and the AI connection behind agents to company users", async () => {
    enable();
    const { companyId, actor, app } = await seed();
    await request(app).post(`/api/companies/${companyId}/onboarding/managed-gateway`).send({ adapterType: "claude_local" });
    const [agent] = await ctx.db.insert(agents).values({
      companyId, name: "Udin", role: "designer", adapterType: "claude_local", adapterConfig: {}, runtimeConfig: {},
    }).returning();

    const agentsApp = routeApp(ctx.db, actor, agentRoutes);
    for (const [method, path] of [
      ["post", `/api/agents/${agent!.id}/keys`],
      ["patch", `/api/agents/${agent!.id}/permissions`],
      ["patch", `/api/agents/${agent!.id}/instructions-bundle`],
    ] as const) {
      const response = await request(agentsApp)[method](path).send({ name: "key" });
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(response.body.details).toMatchObject({ code: "agent_settings_managed" });
    }

    const toolsApp = routeApp(ctx.db, actor, (db) => toolAccessRoutes(db));
    const connections = await request(toolsApp).get(`/api/companies/${companyId}/tools/connections`);
    expect(connections.status).toBe(200);
    expect(connections.body.connections.some((connection: { connectionPurpose: string }) => connection.connectionPurpose === "ai")).toBe(false);
    const adminTools = routeApp(ctx.db, adminActor(companyId, actor.userId!), (db) => toolAccessRoutes(db));
    const adminConnections = await request(adminTools).get(`/api/companies/${companyId}/tools/connections`);
    expect(adminConnections.body.connections.some((connection: { connectionPurpose: string }) => connection.connectionPurpose === "ai")).toBe(true);
  });
});

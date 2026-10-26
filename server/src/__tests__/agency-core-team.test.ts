import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activityLog, agents, routines } from "@paperclipai/db";
import { agencyCoreTeamService } from "../services/agency-core-team.js";
import { teamsCatalogService } from "../services/teams-catalog.js";
import {
  describeEmbeddedPostgres,
  seedCompanyWithBoardAccess,
  useEmbeddedPostgres,
} from "./helpers/route-test-harness.js";

// Wrapped, not replaced: every test installs the real shipped agency-core
// team, and only the failure test swaps in a throwing install.
vi.mock("../services/teams-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/teams-catalog.js")>();
  return { ...actual, teamsCatalogService: vi.fn(actual.teamsCatalogService) };
});

const SPECIALIST_NAMES = [
  "Account Manager",
  "Content Strategist",
  "Copywriter",
  "Creative Designer",
  "Creative Director",
  "Creative Strategist",
  "Marketing Strategist",
  "Performance Analyst",
  "Publishing Coordinator",
  "SEO Specialist",
  "Scriptwriter",
];
const HEAD_NAMES = ["Account Manager", "Creative Director", "Creative Strategist"];

describeEmbeddedPostgres("agencyCoreTeamService.ensureInstalled", () => {
  const ctx = useEmbeddedPostgres("agency-core-team");
  let runnerSelectionSpy: { mockRestore(): void } | undefined;

  beforeEach(async () => {
    const selection = await import("../services/agent-runner-selection.js");
    runnerSelectionSpy = vi.spyOn(selection, "resolveNewAgentRunnerForCompany").mockImplementation(async (_db, _companyId, input) =>
      selection.resolveNewAgentRunner({ ...input, target: { driver: "local", platform: "linux", architecture: "x64" } }));
  });

  afterEach(() => {
    runnerSelectionSpy?.mockRestore();
  });

  async function seedDirector(overrides: Partial<typeof agents.$inferInsert> = {}) {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Agency core");
    const director = await ctx.db.insert(agents).values({
      companyId: seeded.companyId,
      name: "Rina",
      role: "ceo",
      title: "Agency Director",
      adapterType: "claude_local",
      adapterConfig: { model: "claude-opus-5-5", cwd: "/rina/private/workspace" },
      runtimeConfig: {},
      permissions: {},
      ...overrides,
    }).returning().then((rows) => rows[0]!);
    const actor = { actorType: "user" as const, actorId: seeded.userId, userId: seeded.userId };
    return { ...seeded, director, actor };
  }

  it("installs 11 specialists under a renamed director", async () => {
    const { companyId, director, actor } = await seedDirector();

    const result = await agencyCoreTeamService(ctx.db).ensureInstalled(companyId, director.id, actor);

    expect(result.status).toBe("installed");
    if (result.status !== "installed") return;
    expect(result.agentIds).toHaveLength(11);
    expect(result.agentIds).not.toContain(director.id);

    const companyAgents = await ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(companyAgents).toHaveLength(12);
    const specialists = companyAgents.filter((agent) => agent.id !== director.id);
    expect(specialists.map((agent) => agent.id).sort()).toEqual([...result.agentIds].sort());
    expect(specialists.map((agent) => agent.name).sort()).toEqual(SPECIALIST_NAMES);

    // The adopted Director keeps her own name and is the only root.
    const rina = companyAgents.find((agent) => agent.id === director.id)!;
    expect(rina.name).toBe("Rina");
    expect(rina.reportsTo).toBeNull();
    const heads = specialists.filter((agent) => agent.reportsTo === director.id);
    expect(heads.map((agent) => agent.name).sort()).toEqual(HEAD_NAMES);
    // Every specialist reports either to Rina or to another specialist.
    const specialistIds = new Set(specialists.map((agent) => agent.id));
    for (const agent of specialists) {
      expect(agent.reportsTo === director.id || specialistIds.has(agent.reportsTo ?? "")).toBe(true);
    }

    // Specialists run on the Director's adapter and model, and nothing else of
    // her configuration leaks into theirs.
    for (const agent of specialists) {
      expect(agent.adapterType).toBe("claude_local");
      expect(agent.adapterConfig.model).toBe("claude-opus-5-5");
      expect(agent.adapterConfig.cwd).toBeUndefined();
    }

    const companyRoutines = await ctx.db.select().from(routines).where(eq(routines.companyId, companyId));
    expect(companyRoutines).toHaveLength(1);
    expect(companyRoutines[0]?.title).toBe("Director Review");
    expect(companyRoutines[0]?.assigneeAgentId).toBe(director.id);
  });

  it("keeps a Paperclip Runner Director's harness for the specialists", async () => {
    const { companyId, director, actor } = await seedDirector({
      adapterType: "paperclip_runner",
      adapterConfig: { provider: "acpx", acpxAgent: "claude", model: "claude-opus-5-5" },
    });

    const result = await agencyCoreTeamService(ctx.db).ensureInstalled(companyId, director.id, actor);

    expect(result.status).toBe("installed");
    const specialists = (await ctx.db.select().from(agents).where(eq(agents.companyId, companyId)))
      .filter((agent) => agent.id !== director.id);
    expect(specialists).toHaveLength(11);
    for (const agent of specialists) {
      expect(agent).toMatchObject({
        adapterType: "paperclip_runner",
        adapterConfig: { provider: "acpx", acpxAgent: "claude", model: "claude-opus-5-5" },
      });
    }
  });

  it("is idempotent", async () => {
    const { companyId, director, actor } = await seedDirector();
    const svc = agencyCoreTeamService(ctx.db);

    expect((await svc.ensureInstalled(companyId, director.id, actor)).status).toBe("installed");
    const second = await svc.ensureInstalled(companyId, director.id, actor);

    expect(second).toEqual({ status: "already_installed" });
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(12);
    expect(await ctx.db.select().from(routines).where(eq(routines.companyId, companyId))).toHaveLength(1);
  });

  it("serializes concurrent installs for the same company", async () => {
    const { companyId, director, actor } = await seedDirector();
    const svc = agencyCoreTeamService(ctx.db);

    const results = await Promise.all([
      svc.ensureInstalled(companyId, director.id, actor),
      svc.ensureInstalled(companyId, director.id, actor),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["already_installed", "installed"]);
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(12);
  });

  it("returns failed and logs activity when install throws", async () => {
    const { companyId, director, actor } = await seedDirector();
    const actual = await vi.importActual<typeof import("../services/teams-catalog.js")>("../services/teams-catalog.js");
    vi.mocked(teamsCatalogService).mockImplementationOnce((db) => ({
      ...actual.teamsCatalogService(db),
      installCatalogTeam: async () => {
        throw new Error("catalog unavailable");
      },
    }));

    const result = await agencyCoreTeamService(ctx.db).ensureInstalled(companyId, director.id, actor);

    expect(result).toEqual({ status: "failed", error: "catalog unavailable" });
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
    const entries = await ctx.db
      .select()
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "company.agency_core_team_install_failed"),
      ));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorType: "user",
      actorId: actor.actorId,
      entityType: "company",
      entityId: companyId,
      details: { directorAgentId: director.id, error: "catalog unavailable" },
    });
  });

  it("rejects pending-approval director", async () => {
    const { companyId, director, actor } = await seedDirector({ status: "pending_approval" });

    await expect(
      agencyCoreTeamService(ctx.db).ensureInstalled(companyId, director.id, actor),
    ).rejects.toMatchObject({ status: 409, message: "Agency Director is waiting for approval." });
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
  });

  it("rejects a missing, foreign or non-director agent", async () => {
    const { companyId, director, actor } = await seedDirector();
    const other = await seedDirector();
    const [writer] = await ctx.db.insert(agents).values({
      companyId,
      name: "Writer",
      role: "general",
      adapterType: "claude_local",
    }).returning();
    const svc = agencyCoreTeamService(ctx.db);

    for (const agentId of ["00000000-0000-4000-8000-000000000000", other.director.id, writer!.id]) {
      await expect(svc.ensureInstalled(companyId, agentId, actor)).rejects.toMatchObject({ status: 422 });
    }
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(2);
    expect(await ctx.db.select().from(agents).where(eq(agents.reportsTo, director.id))).toHaveLength(0);
  });
});

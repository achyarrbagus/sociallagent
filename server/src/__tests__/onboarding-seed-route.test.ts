import { randomUUID } from "node:crypto";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  companyMemberships,
  companyOnboardingSeeds,
  companySkills,
  goals,
  issues,
  projects,
} from "@paperclipai/db";
import { onboardingSeedRoutes } from "../routes/onboarding-seed.js";
import { logActivity } from "../services/activity-log.js";
import { teamsCatalogService } from "../services/teams-catalog.js";
import {
  describeEmbeddedPostgres,
  resetCompanyIssueFixtures,
  routeApp,
  seedCompanyWithBoardAccess,
  useEmbeddedPostgres,
  type BoardActor,
} from "./helpers/route-test-harness.js";

// Wrapped, not replaced: every other test here asserts the real activity row,
// so the default implementation stays the genuine one and a single test opts
// into failure with `mockRejectedValueOnce`.
vi.mock("../services/activity-log.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/activity-log.js")>();
  return { ...actual, logActivity: vi.fn(actual.logActivity) };
});

// Wrapped the same way: the real agency-core team installs everywhere except
// the one test that opts into a failing install.
vi.mock("../services/teams-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/teams-catalog.js")>();
  return { ...actual, teamsCatalogService: vi.fn(actual.teamsCatalogService) };
});

const SEED = {
  revision: "a".repeat(32),
  mission: "Make robotics boring enough to trust",
  agent: { name: "Ada", role: "Chief of Staff" },
  firstTask: { title: "Draft the one-page strategy", details: "One page, no more" },
};

describeEmbeddedPostgres("POST /api/companies/:companyId/onboarding-seed", () => {
  const ctx = useEmbeddedPostgres("onboarding-seed-route");
  let runnerSelectionSpy: { mockRestore(): void } | undefined;

  beforeEach(async () => {
    const selection = await import("../services/agent-runner-selection.js");
    runnerSelectionSpy = vi.spyOn(selection, "resolveNewAgentRunnerForCompany").mockImplementation(async (_db, _companyId, input) =>
      selection.resolveNewAgentRunner({ ...input, target: { driver: "local", platform: "linux", architecture: "x64" } }));
  });

  afterEach(async () => {
    runnerSelectionSpy?.mockRestore();
    await ctx.db.delete(activityLog);
    await ctx.db.delete(companyOnboardingSeeds);
    await ctx.db.delete(issues);
    await ctx.db.delete(projects);
    await ctx.db.delete(agents);
    await ctx.db.delete(goals);
    // Rows the agency-core team install adds alongside its agents.
    await ctx.db.delete(companySkills);
    await resetCompanyIssueFixtures(ctx.db);
  });

  async function seedCompany() {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Onboarding seed");
    return { ...seeded, app: routeApp(ctx.db, seeded.actor, onboardingSeedRoutes) };
  }

  function post(app: ReturnType<typeof routeApp>, companyId: string, body: unknown) {
    return request(app).post(`/api/companies/${companyId}/onboarding-seed`).send(body);
  }

  // The seed hires the Agency Director; the default agency team installed under
  // her adds specialists, so seed assertions read the Director alone.
  function directorsOf(companyId: string) {
    return ctx.db.select().from(agents).where(and(eq(agents.companyId, companyId), eq(agents.role, "ceo")));
  }

  function agentsOf(companyId: string) {
    return ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
  }

  // The agency team brings its own Agency Operations project.
  function onboardingProjectsOf(companyId: string) {
    return ctx.db.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.name, "Onboarding")));
  }

  // Ordering, not eventual consistency: every assertion below reads the
  // database immediately after the 200 comes back, with no waiting and no
  // polling. A lazy receiver that applied the seed in the background would
  // fail here on any machine — which is the point, since Cloud gates the
  // redirect into the tenant dashboard on this response.
  it("applies the mission, the first agent and the first task before it answers", async () => {
    const { companyId, app } = await seedCompany();

    const response = await post(app, companyId, SEED);

    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(true);
    expect(response.body.changed).toBe(true);
    expect(response.body.revision).toBe(SEED.revision);
    expect(response.body.agencyTeam).toMatchObject({ status: "installed" });
    expect(response.body.agencyTeam.agentIds).toHaveLength(11);

    const companyGoals = await ctx.db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(companyGoals).toHaveLength(1);
    expect(companyGoals[0]?.title).toBe(SEED.mission);
    expect(companyGoals[0]?.level).toBe("company");
    expect(companyGoals[0]?.status).toBe("active");

    const companyAgents = await directorsOf(companyId);
    expect(companyAgents).toHaveLength(1);
    expect(companyAgents[0]?.name).toBe("Ada");
    // The seed's free-text role is a job title; the structural role stays `ceo`.
    expect(companyAgents[0]?.title).toBe("Chief of Staff");
    expect(companyAgents[0]?.role).toBe("ceo");
    expect(companyAgents[0]?.adapterConfig).toMatchObject({
      paperclipSkillSync: {
        desiredSkills: expect.arrayContaining([
          "paperclipai/paperclip/paperclip-board",
          "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
          "paperclipai/paperclip/paperclip-create-agent",
          "paperclipai/paperclip/para-memory-files",
        ]),
      },
    });

    const companyIssues = await ctx.db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(companyIssues).toHaveLength(1);
    expect(companyIssues[0]?.title).toBe(SEED.firstTask.title);
    expect(companyIssues[0]?.description).toBe(SEED.firstTask.details);
    expect(companyIssues[0]?.assigneeAgentId).toBe(companyAgents[0]?.id);
    expect(companyIssues[0]?.goalId).toBe(companyGoals[0]?.id);

    const companyProjects = await onboardingProjectsOf(companyId);
    expect(companyProjects).toHaveLength(1);
    expect(companyProjects[0]?.name).toBe("Onboarding");
    expect(companyIssues[0]?.projectId).toBe(companyProjects[0]?.id);

    const record = await ctx.db
      .select()
      .from(companyOnboardingSeeds)
      .where(eq(companyOnboardingSeeds.companyId, companyId));
    expect(record).toHaveLength(1);
    expect(record[0]?.revision).toBe(SEED.revision);
    expect(record[0]?.agentId).toBe(companyAgents[0]?.id);
    expect(record[0]?.issueId).toBe(companyIssues[0]?.id);
  });

  it("uses the qualified Claude default for an unsupported seed adapter override", async () => {
    const previous = process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE;
    process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE = "paperclip_runner";
    try {
      const { companyId, app } = await seedCompany();

      const response = await post(app, companyId, SEED);

      expect(response.status).toBe(200);
      const companyAgents = await directorsOf(companyId);
      expect(companyAgents).toHaveLength(1);
      expect(companyAgents[0]).toMatchObject({ adapterType: "paperclip_runner", adapterConfig: { provider: "acpx", acpxAgent: "claude", model: "claude-opus-5-5" } });
    } finally {
      if (previous === undefined) {
        delete process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE;
      } else {
        process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE = previous;
      }
    }
  });

  it("uses the creation default for server-seeded Codex", async () => {
    const previous = process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE;
    process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE = "codex_local";
    try {
      const { companyId, app } = await seedCompany();
      const response = await post(app, companyId, SEED);
      expect(response.status).toBe(200);
      const [agent] = await directorsOf(companyId);
      expect(agent).toMatchObject({ adapterType: "paperclip_runner", adapterConfig: { provider: "codex" } });
      expect(agent?.adapterConfig).toMatchObject({ paperclipSkillSync: { desiredSkills: expect.arrayContaining(["paperclipai/paperclip/paperclip-create-agent"]) } });
      expect((await post(app, companyId, SEED)).body.changed).toBe(false);
      const [replayed] = await directorsOf(companyId);
      expect(replayed?.adapterConfig).toEqual(agent?.adapterConfig);
    } finally {
      if (previous === undefined) delete process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE;
      else process.env.PAPERCLIP_ONBOARDING_SEED_ADAPTER_TYPE = previous;
    }
  });

  it("is idempotent per revision — a replay creates no second agent or task", async () => {
    const { companyId, app } = await seedCompany();

    const first = await post(app, companyId, SEED);
    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(true);

    const replay = await post(app, companyId, SEED);
    expect(replay.status).toBe(200);
    expect(replay.body.applied).toBe(true);
    // The revision already matched, so nothing was re-applied.
    expect(replay.body.changed).toBe(false);
    expect(replay.body.agentId).toBe(first.body.agentId);
    expect(replay.body.issueId).toBe(first.body.issueId);
    expect(replay.body.agencyTeam).toEqual({ status: "already_installed" });

    expect(await directorsOf(companyId)).toHaveLength(1);
    expect(await agentsOf(companyId)).toHaveLength(12);
    expect(await ctx.db.select().from(issues).where(eq(issues.companyId, companyId))).toHaveLength(1);
    expect(await ctx.db.select().from(goals).where(eq(goals.companyId, companyId))).toHaveLength(1);
    expect(await onboardingProjectsOf(companyId)).toHaveLength(1);
  });

  it("updates in place when the customer edits their answers and the revision changes", async () => {
    const { companyId, app } = await seedCompany();

    const first = await post(app, companyId, SEED);
    expect(first.status).toBe(200);

    const revised = await post(app, companyId, {
      revision: "b".repeat(32),
      mission: "Make robotics dependable",
      agent: { name: "Grace", role: "Head of Ops" },
      firstTask: { title: "Draft the two-page strategy", details: "Two pages now" },
    });
    expect(revised.status).toBe(200);
    expect(revised.body.changed).toBe(true);
    expect(revised.body.agentId).toBe(first.body.agentId);
    expect(revised.body.issueId).toBe(first.body.issueId);

    const companyAgents = await directorsOf(companyId);
    expect(companyAgents).toHaveLength(1);
    expect(companyAgents[0]?.name).toBe("Grace");
    expect(companyAgents[0]?.title).toBe("Head of Ops");

    const companyIssues = await ctx.db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(companyIssues).toHaveLength(1);
    expect(companyIssues[0]?.title).toBe("Draft the two-page strategy");

    const companyGoals = await ctx.db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(companyGoals).toHaveLength(1);
    expect(companyGoals[0]?.title).toBe("Make robotics dependable");
  });

  it("splits a multi-line mission into a goal title and description", async () => {
    const { companyId, app } = await seedCompany();

    const response = await post(app, companyId, {
      revision: "c".repeat(32),
      mission: "Make robotics boring\nBoring enough that hospitals buy it.",
    });

    expect(response.status).toBe(200);
    const companyGoals = await ctx.db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(companyGoals[0]?.title).toBe("Make robotics boring");
    expect(companyGoals[0]?.description).toBe("Boring enough that hospitals buy it.");
    // No agent and no task were sent, so none were invented.
    const committedAgents = await ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(committedAgents).toHaveLength(0);
    expect(await ctx.db.select().from(projects).where(eq(projects.companyId, companyId))).toHaveLength(0);
    expect(await ctx.db.select().from(issues).where(eq(issues.companyId, companyId))).toHaveLength(0);
    expect(response.body.agentId).toBeNull();
    expect(response.body.issueId).toBeNull();
    expect(response.body.agencyTeam).toBeNull();
  });

  it("reports and logs a failed team install without failing the seed", async () => {
    const { companyId, app } = await seedCompany();
    const actual = await vi.importActual<typeof import("../services/teams-catalog.js")>("../services/teams-catalog.js");
    vi.mocked(teamsCatalogService).mockImplementationOnce((db) => ({
      ...actual.teamsCatalogService(db),
      installCatalogTeam: async () => {
        throw new Error("catalog unavailable");
      },
    }));

    const response = await post(app, companyId, SEED);

    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(true);
    expect(response.body.agencyTeam).toEqual({ status: "failed", error: "catalog unavailable" });
    expect(await agentsOf(companyId)).toHaveLength(1);
    const entries = await ctx.db
      .select()
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "company.agency_core_team_install_failed"),
      ));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.details).toEqual({
      directorAgentId: response.body.agentId,
      error: "catalog unavailable",
    });
  });

  it("accepts a revision-only seed and records it", async () => {
    const { companyId, app } = await seedCompany();

    const response = await post(app, companyId, { revision: "d".repeat(32) });

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    const record = await ctx.db
      .select()
      .from(companyOnboardingSeeds)
      .where(eq(companyOnboardingSeeds.companyId, companyId));
    expect(record[0]?.revision).toBe("d".repeat(32));
    expect(record[0]?.mission).toBeNull();
  });

  it("logs the application once, and not again on a replay", async () => {
    const { companyId, app } = await seedCompany();

    await post(app, companyId, SEED);
    await post(app, companyId, SEED);

    const entries = await ctx.db
      .select()
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "company.onboarding_seed_applied"),
      ));
    expect(entries).toHaveLength(1);
  });

  it("reuses the committed hire after the content transaction fails", async () => {
    const { companyId, app } = await seedCompany();

    // Injected at the module boundary, not on `ctx.db`: the audit write goes
    // through the transaction handle, so a spy on the outer connection would
    // never be reached and the test would pass for the wrong reason.
    vi.mocked(logActivity).mockRejectedValueOnce(new Error("activity log unavailable"));

    const failed = await post(app, companyId, SEED);
    expect(failed.status).toBeGreaterThanOrEqual(500);

    // The failed content transaction must not acknowledge the revision.
    expect(
      await ctx.db
        .select()
        .from(companyOnboardingSeeds)
        .where(eq(companyOnboardingSeeds.companyId, companyId)),
    ).toHaveLength(0);
    const committedAgents = await agentsOf(companyId);
    expect(committedAgents).toHaveLength(1);
    expect(await ctx.db.select().from(projects).where(eq(projects.companyId, companyId))).toHaveLength(0);

    await post(app, companyId, SEED).expect(200);
    expect((await directorsOf(companyId)).map(agent => agent.id))
      .toEqual(committedAgents.map(agent => agent.id));
    expect(
      await ctx.db
        .select()
        .from(activityLog)
        .where(and(
          eq(activityLog.companyId, companyId),
          eq(activityLog.action, "company.onboarding_seed_applied"),
        )),
    ).toHaveLength(1);
  });

  it("refuses a caller without access to the company", async () => {
    const { companyId } = await seedCompany();
    const strangerActor: BoardActor = {
      type: "board",
      source: "session",
      userId: `user-${randomUUID()}`,
      companyIds: [randomUUID()],
      memberships: [],
      isInstanceAdmin: false,
    };
    const strangerApp = routeApp(ctx.db, strangerActor, onboardingSeedRoutes);

    const response = await post(strangerApp, companyId, SEED);

    expect(response.status).toBe(403);
    const committedAgents = await ctx.db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(committedAgents).toHaveLength(0);
    expect(await ctx.db.select().from(projects).where(eq(projects.companyId, companyId))).toHaveLength(0);
    expect(await ctx.db.select().from(companyOnboardingSeeds)).toHaveLength(0);
  });

  it("rejects a body missing the revision", async () => {
    const { companyId, app } = await seedCompany();

    const response = await post(app, companyId, { mission: "No revision here" });

    expect(response.status).toBe(400);
    expect(await ctx.db.select().from(companyOnboardingSeeds)).toHaveLength(0);
  });

  it("rejects seed fields past the bounds Cloud enforces before sending", async () => {
    const { companyId, app } = await seedCompany();

    const overlongMission = await post(app, companyId, {
      revision: "e".repeat(32),
      mission: "m".repeat(2001),
    });
    expect(overlongMission.status).toBe(400);

    const overlongAgentName = await post(app, companyId, {
      revision: "e".repeat(32),
      agent: { name: "n".repeat(81), role: "Chief of Staff" },
    });
    expect(overlongAgentName.status).toBe(400);

    const overlongTaskTitle = await post(app, companyId, {
      revision: "e".repeat(32),
      firstTask: { title: "t".repeat(201) },
    });
    expect(overlongTaskTitle.status).toBe(400);

    expect(await ctx.db.select().from(companyOnboardingSeeds)).toHaveLength(0);
  });

  it("never reads the seed from a trusted Cloud header", async () => {
    const { companyId, app } = await seedCompany();

    // The `x-paperclip-cloud-*` set is the trusted identity channel, derived
    // server-side. A mission planted there must be ignored entirely — only the
    // body is read.
    const response = await request(app)
      .post(`/api/companies/${companyId}/onboarding-seed`)
      .set("x-paperclip-cloud-mission", "Header-supplied mission")
      .set("x-paperclip-cloud-paperclip-company-name", "Header-supplied mission")
      .send({ revision: "f".repeat(32), mission: "Body-supplied mission" });

    expect(response.status).toBe(200);
    const companyGoals = await ctx.db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(companyGoals[0]?.title).toBe("Body-supplied mission");
  });

  it("reuses an existing Onboarding project instead of creating a second one", async () => {
    const { companyId, app } = await seedCompany();
    await ctx.db.insert(projects).values({
      companyId,
      name: "Onboarding",
      status: "in_progress",
    });

    const response = await post(app, companyId, SEED);

    expect(response.status).toBe(200);
    const companyProjects = await onboardingProjectsOf(companyId);
    expect(companyProjects).toHaveLength(1);
    const companyIssues = await ctx.db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(companyIssues[0]?.projectId).toBe(companyProjects[0]?.id);
  });

  it("does not duplicate entities when two identical pushes race", async () => {
    const { companyId, app } = await seedCompany();

    // Cloud's reconcile runs off portfolio fetches that can overlap, so the
    // same revision can be pushed twice at once. The per-company advisory lock
    // must serialize them: without it both pass the revision check before
    // either writes the seed record and each creates a goal, an agent, a
    // project and a task.
    const [first, second] = await Promise.all([
      post(app, companyId, SEED),
      post(app, companyId, SEED),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(await ctx.db.select().from(goals).where(eq(goals.companyId, companyId))).toHaveLength(1);
    expect(await directorsOf(companyId)).toHaveLength(1);
    expect(await agentsOf(companyId)).toHaveLength(12);
    expect(await onboardingProjectsOf(companyId)).toHaveLength(1);
    expect(await ctx.db.select().from(issues).where(eq(issues.companyId, companyId))).toHaveLength(1);
    expect(await ctx.db.select().from(companyOnboardingSeeds)).toHaveLength(1);
  });

  it("refreshes a first task's assignee and goal when a later revision adds them", async () => {
    const { companyId, app } = await seedCompany();

    // First push seeds a task but no agent and no mission, so the issue is
    // created unassigned and goal-less.
    const taskOnly = await post(app, companyId, {
      revision: "1".repeat(32),
      firstTask: { title: "Draft the strategy" },
    });
    expect(taskOnly.status).toBe(200);

    const beforeIssue = (await ctx.db.select().from(issues).where(eq(issues.companyId, companyId)))[0];
    expect(beforeIssue?.assigneeAgentId).toBeNull();

    // A later revision supplies the mission and the agent. The existing task is
    // updated in place, and must pick up the newly-created assignee and goal
    // rather than reporting them on the seed record while the issue row stays
    // stale.
    const withAgent = await post(app, companyId, {
      revision: "2".repeat(32),
      mission: "Make robotics boring enough to trust",
      agent: { name: "Ada", role: "Chief of Staff" },
      firstTask: { title: "Draft the strategy" },
    });
    expect(withAgent.status).toBe(200);

    const companyIssues = await ctx.db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(companyIssues).toHaveLength(1);
    const companyAgents = await directorsOf(companyId);
    const companyGoals = await ctx.db.select().from(goals).where(eq(goals.companyId, companyId));
    expect(companyIssues[0]?.assigneeAgentId).toBe(companyAgents[0]?.id);
    expect(companyIssues[0]?.goalId).toBe(companyGoals[0]?.id);
  });
});

describeEmbeddedPostgres("POST /api/companies/:companyId/onboarding/agency-team", () => {
  const ctx = useEmbeddedPostgres("onboarding-agency-team-route");
  let runnerSelectionSpy: { mockRestore(): void } | undefined;

  beforeEach(async () => {
    const selection = await import("../services/agent-runner-selection.js");
    runnerSelectionSpy = vi.spyOn(selection, "resolveNewAgentRunnerForCompany").mockImplementation(async (_db, _companyId, input) =>
      selection.resolveNewAgentRunner({ ...input, target: { driver: "local", platform: "linux", architecture: "x64" } }));
  });

  afterEach(() => {
    runnerSelectionSpy?.mockRestore();
  });

  async function seedDirector() {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Agency team route");
    const [director] = await ctx.db.insert(agents).values({
      companyId: seeded.companyId,
      name: "Rina",
      role: "ceo",
      adapterType: "claude_local",
      adapterConfig: { model: "claude-opus-5-5" },
    }).returning();
    return { ...seeded, director: director! };
  }

  function post(app: ReturnType<typeof routeApp>, companyId: string, body: unknown) {
    return request(app).post(`/api/companies/${companyId}/onboarding/agency-team`).send(body);
  }

  it("installs the team for the board and reports a replay as already installed", async () => {
    const { companyId, actor, director } = await seedDirector();
    const app = routeApp(ctx.db, actor, onboardingSeedRoutes);

    const first = await post(app, companyId, { agentId: director.id });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "installed" });
    expect(first.body.agentIds).toHaveLength(11);

    const replay = await post(app, companyId, { agentId: director.id });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ status: "already_installed" });
  });

  it("refuses an agent actor", async () => {
    const { companyId, director } = await seedDirector();
    const agentActor = { type: "agent", agentId: director.id, companyId, source: "agent_key" };
    const app = routeApp(ctx.db, agentActor as unknown as BoardActor, onboardingSeedRoutes);

    const response = await post(app, companyId, { agentId: director.id });

    expect(response.status).toBe(403);
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
  });

  it("refuses a board user without access to the company", async () => {
    const { companyId, director } = await seedDirector();
    const strangerActor: BoardActor = {
      type: "board",
      source: "session",
      userId: `user-${randomUUID()}`,
      companyIds: [randomUUID()],
      memberships: [],
      isInstanceAdmin: false,
    };
    const app = routeApp(ctx.db, strangerActor, onboardingSeedRoutes);

    const response = await post(app, companyId, { agentId: director.id });

    expect(response.status).toBe(403);
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
  });

  it("refuses a board member without agents:create", async () => {
    const { companyId, director } = await seedDirector();
    // An active member with no permission grants: company access passes, the
    // `agents:create` gate shared with catalog team installs does not.
    const userId = `user-${randomUUID()}`;
    await ctx.db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "operator",
      updatedAt: new Date(),
    });
    const memberActor: BoardActor = {
      type: "board",
      source: "session",
      userId,
      companyIds: [companyId],
      memberships: [{ companyId, membershipRole: "operator", status: "active" }],
      isInstanceAdmin: false,
    };
    const app = routeApp(ctx.db, memberActor, onboardingSeedRoutes);

    const response = await post(app, companyId, { agentId: director.id });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Missing permission: agents:create");
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
  });

  it("rejects a Director from another company", async () => {
    const { companyId, actor } = await seedDirector();
    const other = await seedDirector();
    const app = routeApp(ctx.db, actor, onboardingSeedRoutes);

    const response = await post(app, companyId, { agentId: other.director.id });

    expect(response.status).toBe(422);
    expect(await ctx.db.select().from(agents).where(eq(agents.companyId, companyId))).toHaveLength(1);
  });

  it("rejects a body without a valid agent id", async () => {
    const { companyId, actor } = await seedDirector();
    const app = routeApp(ctx.db, actor, onboardingSeedRoutes);

    expect((await post(app, companyId, { agentId: "not-a-uuid" })).status).toBe(400);
  });
});

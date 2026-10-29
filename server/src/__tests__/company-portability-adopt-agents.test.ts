import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, issues } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { CompanyPortabilityFileEntry, CompanyPortabilityImport } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyPortabilityService } from "../services/company-portability.js";

// Proves the importer can adopt an existing company agent into a package slot:
// the adopted slug is never created, and package reports and tasks that point
// at that slug attach to the existing agent instead.

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function buildTeamBundle(): Record<string, CompanyPortabilityFileEntry> {
  return {
    "COMPANY.md": ['---', 'schema: "agentcompanies/v1"', 'name: "Adopt Team"', '---', '', 'Team package.', ''].join("\n"),
    "agents/director/AGENTS.md": [
      '---',
      'name: "Director"',
      'kind: agent',
      '---',
      '',
      'Package director instructions.',
      '',
    ].join("\n"),
    "agents/writer/AGENTS.md": [
      '---',
      'name: "Writer"',
      'kind: agent',
      'reportsTo: director',
      '---',
      '',
      'Package writer instructions.',
      '',
    ].join("\n"),
    "tasks/review/TASK.md": [
      '---',
      'name: "Review"',
      'kind: task',
      'assignee: director',
      '---',
      '',
      'Review the work.',
      '',
    ].join("\n"),
  };
}

describeEmbeddedPostgres("company portability adoptAgents", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: ReturnType<typeof createDb>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-portability-adopt-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyWithAgent(agentName: string) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: `Adopt fixture ${companyId.slice(0, 6)}`,
      issuePrefix: `A${companyId.slice(0, 6).toUpperCase()}`,
    });
    const agent = await db.insert(agents).values({
      companyId,
      name: agentName,
      role: "ceo",
      adapterType: "process",
      adapterConfig: { promptTemplate: "Rina's own instructions." },
      runtimeConfig: {},
      permissions: {},
    }).returning().then((rows) => rows[0]!);
    return { companyId, agent };
  }

  function importInput(companyId: string): CompanyPortabilityImport {
    return {
      source: { type: "inline", rootPath: "adopt-team", files: buildTeamBundle() },
      include: { company: false, agents: true, projects: false, issues: true },
      target: { mode: "existing_company", companyId },
      collisionStrategy: "rename",
      // `process` (the frontmatter default) is forbidden in agent_safe imports.
      adapterOverrides: { writer: { adapterType: "claude_local" } },
    };
  }

  it("adopts the manager slot", async () => {
    const { companyId, agent: rina } = await seedCompanyWithAgent("Rina");
    const portability = companyPortabilityService(db);

    const preview = await portability.previewImport(importInput(companyId), {
      mode: "agent_safe",
      sourceCompanyId: companyId,
      adoptAgents: { director: rina.id },
    });
    expect(preview.errors).toEqual([]);
    expect(preview.plan.agentPlans.find((plan) => plan.slug === "director")).toMatchObject({
      action: "skip",
      existingAgentId: rina.id,
    });

    const result = await portability.importBundle(importInput(companyId), null, {
      mode: "agent_safe",
      sourceCompanyId: companyId,
      adoptAgents: { director: rina.id },
    });

    const companyAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(companyAgents).toHaveLength(2);
    const writer = companyAgents.find((row) => row.name === "Writer");
    expect(writer?.reportsTo).toBe(rina.id);

    const after = companyAgents.find((row) => row.id === rina.id)!;
    expect(after.name).toBe("Rina");
    expect(after.adapterConfig).toEqual(rina.adapterConfig);
    expect(after.adapterType).toBe(rina.adapterType);
    expect(after.reportsTo).toBeNull();

    const reviewIssues = await db.select().from(issues).where(eq(issues.companyId, companyId));
    const review = reviewIssues.find((row) => row.title === "Review");
    expect(review?.assigneeAgentId).toBe(rina.id);

    expect(result.agents.find((entry) => entry.slug === "director")).toMatchObject({
      id: rina.id,
      action: "skipped",
    });
  });

  it("rejects foreign adopt target", async () => {
    const { companyId } = await seedCompanyWithAgent("Rina");
    const { agent: foreign } = await seedCompanyWithAgent("Other");
    const portability = companyPortabilityService(db);
    const options = {
      mode: "agent_safe" as const,
      sourceCompanyId: companyId,
      adoptAgents: { director: foreign.id },
    };

    const preview = await portability.previewImport(importInput(companyId), options);
    expect(preview.errors).toContain(
      `Adopted agent director (${foreign.id}) is not present in the target company.`,
    );

    await expect(portability.importBundle(importInput(companyId), null, options))
      .rejects.toThrow(/Adopted agent director/);
    const companyAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
    expect(companyAgents).toHaveLength(1);
    const companyIssues = await db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(companyIssues.filter((row) => row.title === "Review")).toHaveLength(0);
  });
});

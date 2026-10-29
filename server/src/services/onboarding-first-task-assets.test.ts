import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ONBOARDING_FIRST_TASK_OPENING_INTERVIEW_OPTION_ID,
  ONBOARDING_FIRST_TASK_OPENING_QUESTION_ID,
  ONBOARDING_FIRST_TASK_OPENING_TASK_OPTION_ID,
  buildOnboardingFirstTaskBrief,
  buildOnboardingFirstTaskOpeningQuestion,
  buildOnboardingFirstAgentInstructionsBundle,
  fillFirstTaskPlaceholders,
  renderAgencyDirectorPersona,
  renderOnboardingFirstTaskGreeting,
} from "./onboarding-first-task-assets.js";

describe("fillFirstTaskPlaceholders", () => {
  it("fills the name and organization when present", () => {
    const out = fillFirstTaskPlaceholders(
      "I'm {{agentName}}, the Agency Director for {{organizationName}}.",
      { agentName: "Ada", organizationName: "Acme" },
    );
    expect(out).toBe("I'm Ada, the Agency Director for Acme.");
  });

  it("drops the name and its trailing separator when no name is set", () => {
    const out = fillFirstTaskPlaceholders("I'm {{agentName}}, your first agent teammate.", {
      agentName: null,
    });
    expect(out).toBe("I'm your first agent teammate.");
  });

  it("falls back to a generic organization label when missing", () => {
    const out = fillFirstTaskPlaceholders("for {{organizationName}}.", {});
    expect(out).toBe("for your organization.");
  });
});

describe("renderOnboardingFirstTaskGreeting", () => {
  it("renders the board-approved greeting with the agent name", async () => {
    const greeting = await renderOnboardingFirstTaskGreeting({ agentName: "Ada" });
    expect(greeting).toContain("Welcome to Paperclip! I'm Ada, your first agent teammate.");
    // The "what would you like to do" question moved onto the opening card.
    expect(greeting).not.toContain("What would you like to do?");
  });
});

describe("buildOnboardingFirstTaskOpeningQuestion", () => {
  it("builds the two-option opening card with a free-text task option", async () => {
    const payload = await buildOnboardingFirstTaskOpeningQuestion();
    expect(payload.version).toBe(1);
    expect(payload.supersedeOnUserComment).toBe(true);
    expect(payload.submitLabel).toBe("Continue");
    expect(payload.questions).toHaveLength(1);
    const [question] = payload.questions;
    expect(question.id).toBe(ONBOARDING_FIRST_TASK_OPENING_QUESTION_ID);
    expect(question.selectionMode).toBe("single");
    expect(question.required).toBe(true);
    expect(question.prompt).toBe("What would you like to do?");
    expect(question.options.map((option) => option.id)).toEqual([
      ONBOARDING_FIRST_TASK_OPENING_INTERVIEW_OPTION_ID,
      ONBOARDING_FIRST_TASK_OPENING_TASK_OPTION_ID,
    ]);
    expect(question.options[0].label).toBe("Interview me about the agency and our first client");
    expect(question.options[0].description).toBe(
      "I'll learn about your agency, your first client and brand, then plan the team's first work.",
    );
    expect(question.options[0].freeText).toBeUndefined();
    expect(question.options[1].label).toBe("I already have a brief");
    expect(question.options[1].freeText).toBe(true);
  });
});

describe("buildOnboardingFirstTaskBrief", () => {
  it.each([
    { usePlanProposal: false, mode: "confirmation" },
    { usePlanProposal: true, mode: "plan" },
  ])("invokes the skill with $mode mode without inlining the policy", async ({ usePlanProposal, mode }) => {
    const brief = await buildOnboardingFirstTaskBrief({ usePlanProposal });
    expect(brief).toContain("Use the `first-task` skill (/first-task)");
    expect(brief).toContain("Read its SKILL.md");
    expect(brief).toContain("subsequent wakes of this task");
    expect(brief).toContain(`Single-task proposal mode: \`${mode}\`.`);
    expect(brief).not.toContain("{{");
    expect(brief).not.toContain("Take the path the user picked.");
    expect(brief).not.toContain("request_confirmation");
    expect(brief).not.toContain("request_checkbox_confirmation");
  });
});

describe("first-task proposal mode policy", () => {
  it("maps both persisted brief modes to their proposal forms", async () => {
    const skill = await readFile(new URL("../onboarding-assets/first-task/skills/first-task/SKILL.md", import.meta.url), "utf8");
    expect(skill).toContain("`confirmation` means one `request_confirmation`");
    expect(skill).toContain("`plan` means save a short `plan` document");
    expect(skill).toContain("`request_checkbox_confirmation` targeting its saved revision");
    expect(skill).toContain("explicit plan requests regardless of the single-task proposal mode");
  });

  it("delegates accepted work to the installed team's own execution before reporting results", async () => {
    const skill = await readFile(new URL("../onboarding-assets/first-task/skills/first-task/SKILL.md", import.meta.url), "utf8");
    expect(skill).toContain("self-contained");
    expect(skill).toContain("own Paperclip execution produces and saves the deliverable");
    expect(skill).toContain("do not create or register it from the onboarding run");
    expect(skill).toContain("preserve existing blocker IDs");
    expect(skill).toContain("`set_dependencies`");
    expect(skill).toContain("`paperclip_block`");
    expect(skill).toContain("`blockedByIssueIds`");
    expect(skill).toContain("End the turn so the team can execute");
    expect(skill).toContain("Do not poll for results");
    expect(skill).toContain("verify the saved task document and any retrievable file");
    expect(skill).toContain("waiting for their review and approval");
  });

  it("delegates to the three heads without proposing or hiring a team", async () => {
    const skill = await readFile(new URL("../onboarding-assets/first-task/skills/first-task/SKILL.md", import.meta.url), "utf8");
    expect(skill).toContain("Do not propose or hire a team from scratch");
    expect(skill).toContain("Clients & Brands");
    expect(skill).toContain("Only the owner approves final content");
    expect(skill).toContain("Do not start its implementation without authorization");
    expect(skill).toContain("create the first delegated tasks, one for each of the three heads");
    expect(skill).toContain("Create exactly one task linked to this onboarding task");
    expect(skill).toContain("continue that same task instead of creating another");
  });
});

describe("onboarding assets", () => {
  it("never mention the CEO or a chief of staff", async () => {
    const root = fileURLToPath(new URL("../onboarding-assets/", import.meta.url));
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(join(file.parentPath, file.name), "utf8");
      expect(text, join(file.parentPath, file.name)).not.toMatch(/\bCEO\b|chief of staff/i);
    }
  });

  // The team install can fail while onboarding still completes, so every
  // asset that delegates to the three heads must handle their absence.
  it("tell the Director what to do when the agency team is missing", async () => {
    for (const path of [
      "first-task/agency-director/AGENTS.md",
      "first-task/skills/first-task/SKILL.md",
      "ceo/AGENTS.md",
      "ceo/HEARTBEAT.md",
    ]) {
      const text = await readFile(new URL(`../onboarding-assets/${path}`, import.meta.url), "utf8");
      expect(text, path).toContain("tell the owner the agency team isn't installed");
      expect(text, path).toContain("going Back in onboarding and pressing Connect");
      expect(text, path).toContain("do not assign work to agents that don't exist");
    }
  });
});

describe("Agency Director persona", () => {
  it("renders the persona with placeholders filled", async () => {
    const persona = await renderAgencyDirectorPersona({
      agentName: "Ada",
      organizationName: "Acme",
    });
    expect(persona).toContain("You are Ada, the Agency Director for Acme.");
    expect(persona).toContain("/agency");
    expect(persona).toContain("Only the owner approves final content");
    expect(persona).not.toMatch(/\bCEO\b|chief of staff/i);
    expect(persona).not.toContain("{{agentName}}");
    expect(persona).not.toContain("{{organizationName}}");
  });

  it("returns an AGENTS.md-keyed bundle for the first agent", async () => {
    const bundle = await buildOnboardingFirstAgentInstructionsBundle({
      agentName: "Ada",
      organizationName: "Acme",
    });
    expect(bundle.entryFile).toBe("AGENTS.md");
    expect(bundle.files).toEqual({
      "AGENTS.md": await renderAgencyDirectorPersona({ agentName: "Ada", organizationName: "Acme" }),
    });
  });
});

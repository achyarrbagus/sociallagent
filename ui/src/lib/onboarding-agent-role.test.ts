import { describe, expect, it } from "vitest";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";
import { DEFAULT_AGENT_NAME, DEFAULT_AGENT_ROLE, nextAgentNameForRole } from "./onboarding-agent-role";

describe("onboarding first-agent defaults", () => {
  it("hires the Agency Director, filed under the ceo role", () => {
    expect(DEFAULT_AGENT_ROLE).toBe("ceo");
    expect(DEFAULT_AGENT_NAME).toBe("Agency Director");
  });
});

describe("nextAgentNameForRole", () => {
  it("fills the name from the role when the field is empty", () => {
    expect(nextAgentNameForRole({ currentName: "", nextRole: "cto" })).toBe(
      AGENT_ROLE_LABELS.cto,
    );
  });

  it("replaces the default name the wizard supplied", () => {
    expect(nextAgentNameForRole({ currentName: DEFAULT_AGENT_NAME, nextRole: "designer" })).toBe(
      AGENT_ROLE_LABELS.designer,
    );
  });

  it("replaces the previous default a restored run may still hold", () => {
    expect(nextAgentNameForRole({ currentName: "Chief of staff", nextRole: "designer" })).toBe(
      AGENT_ROLE_LABELS.designer,
    );
  });

  it("replaces a label left by a previous role", () => {
    // Picking CTO then CMO should leave "CMO", not "CTO".
    expect(nextAgentNameForRole({ currentName: AGENT_ROLE_LABELS.cto, nextRole: "cmo" })).toBe(
      AGENT_ROLE_LABELS.cmo,
    );
  });

  it("keeps a name the customer typed", () => {
    // The failure this prevents is silent: the field still holds a plausible
    // name afterwards, so the loss is invisible until the agent is hired.
    expect(nextAgentNameForRole({ currentName: "Ada", nextRole: "engineer" })).toBe("Ada");
  });

  it("keeps a typed name that only differs by surrounding space", () => {
    expect(nextAgentNameForRole({ currentName: "  Ada  ", nextRole: "engineer" })).toBe("  Ada  ");
  });

  it("treats a whitespace-only field as empty", () => {
    expect(nextAgentNameForRole({ currentName: "   ", nextRole: "qa" })).toBe(AGENT_ROLE_LABELS.qa);
  });
});

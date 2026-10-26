import { describe, expect, it } from "vitest";
import { modelDisplayCode, modelDisplayName } from "./model-display";

describe("model display aliases", () => {
  it.each(["sol", "gpt-6.1-sol", "openai/gpt-6-sol", "router/GPT-6-SOL-mini"])("shows Bruno for the Sol family: %s", id => {
    expect(modelDisplayName(id)).toBe("Bruno");
  });
  it.each(["luna", "gpt-6-luna", "openai/gpt-6-luna", "router/GPT-6-LUNA-mini"])("shows Yuna for the Luna family: %s", id => {
    expect(modelDisplayName(id)).toBe("Yuna");
  });
  it("keeps unknown models distinguishable without displaying their names", () => {
    const first = modelDisplayName("vendor/private-model-alpha");
    const second = modelDisplayName("vendor/private-model-beta");
    expect(first).toMatch(/^SocialAgent Model [A-F0-9]{8}$/);
    expect(second).not.toBe(first);
    expect(modelDisplayName("vendor/private-model-alpha")).toBe(first);
    expect(first).not.toMatch(/vendor|private|alpha/);
  });
  it("does not mistake an unrelated family for Sol or Luna", () => {
    expect(modelDisplayName("provider/solaris")).not.toBe("Bruno");
    expect(modelDisplayName("provider/lunatic")).not.toBe("Yuna");
  });
  it("uses stable opaque codes to distinguish versions of the same alias", () => {
    expect(modelDisplayCode("gpt-6-sol")).toMatch(/^[A-F0-9]{8}$/);
    expect(modelDisplayCode("gpt-6-sol")).not.toBe(modelDisplayCode("gpt-6.1-sol"));
    expect(modelDisplayCode("gpt-6-sol")).toBe(modelDisplayCode("gpt-6-sol"));
  });
  it("handles automatic and empty selections", () => {
    expect(modelDisplayName()).toBe("Default");
    expect(modelDisplayName(null)).toBe("Default");
    expect(modelDisplayName(" ")).toBe("Default");
    expect(modelDisplayName("auto")).toBe("Automatic");
  });
});

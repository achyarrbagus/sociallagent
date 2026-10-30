import { afterEach, describe, expect, it, vi } from "vitest";
import { isManagedSandboxOnly } from "../saas-mode.js";

describe("isManagedSandboxOnly", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true in SaaS mode even when the flag is false or absent", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    expect(isManagedSandboxOnly({ enableManagedSandboxOnly: false })).toBe(true);
    expect(isManagedSandboxOnly({})).toBe(true);
    expect(isManagedSandboxOnly(null)).toBe(true);
  });

  it("follows the flag outside SaaS mode", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    expect(isManagedSandboxOnly({ enableManagedSandboxOnly: true })).toBe(true);
    expect(isManagedSandboxOnly({ enableManagedSandboxOnly: false })).toBe(false);
    expect(isManagedSandboxOnly(undefined)).toBe(false);
  });
});

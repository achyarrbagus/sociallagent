import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSaasExecutionAllowed } from "../services/saas-execution-policy.js";

const MESSAGE = "This agent type cannot run in SaaS mode";

describe("assertSaasExecutionAllowed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [{ adapterType: "process", adapterConfig: {} }],
    [{ adapterType: "http", adapterConfig: {} }],
    [{ adapterType: "codex_local", adapterConfig: { engine: "cli" } }],
  ])("refuses %j in SaaS mode with 422", (agent) => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    expect(() => assertSaasExecutionAllowed(agent)).toThrowError(MESSAGE);
    try { assertSaasExecutionAllowed(agent); } catch (e) { expect((e as { status: number }).status).toBe(422); }
  });

  it("allows sandbox-capable agents in SaaS mode", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    expect(() => assertSaasExecutionAllowed({ adapterType: "paperclip_runner", adapterConfig: { provider: "codex" } })).not.toThrow();
    expect(() => assertSaasExecutionAllowed({ adapterType: "codex_local", adapterConfig: { engine: "acp" } })).not.toThrow();
    expect(() => assertSaasExecutionAllowed({ adapterType: "codex_local", adapterConfig: null })).not.toThrow();
  });

  it("is a no-op outside SaaS mode", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    expect(() => assertSaasExecutionAllowed({ adapterType: "process", adapterConfig: { engine: "cli" } })).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSaasExecutionAllowed } from "../services/saas-execution-policy.js";
import { selectHeartbeatRuntime } from "../services/heartbeat/runtime-selection.js";

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

describe("runtime admission in SaaS mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a pre-existing process agent before any dispatch or process spawn", async () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const db = new Proxy({}, { get() { throw new Error("db must not be touched"); } });
    const input = {
      run: { id: "run-1" },
      agent: { id: "a", companyId: "c", adapterType: "process", adapterConfig: { command: "echo" } },
    };
    await expect(selectHeartbeatRuntime(db as never, input as never)).rejects.toThrow(MESSAGE);
  });
});

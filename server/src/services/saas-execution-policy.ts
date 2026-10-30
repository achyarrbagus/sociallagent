import { unprocessable } from "../errors.js";
import { isSaasMode } from "../saas-mode.js";

const HOST_EXECUTING_ADAPTER_TYPES = new Set(["process", "http"]);

function readEngine(adapterConfig: unknown): unknown {
  if (!adapterConfig || typeof adapterConfig !== "object" || Array.isArray(adapterConfig)) return undefined;
  return (adapterConfig as Record<string, unknown>).engine;
}

/**
 * In SaaS mode agent code never runs on the server host. Refuse the generic
 * `process`/`http` adapters and any agent configured for the legacy CLI engine
 * (`adapterConfig.engine === "cli"`). No-op outside SaaS mode.
 */
export function assertSaasExecutionAllowed(agent: { adapterType: string; adapterConfig: unknown }): void {
  if (!isSaasMode()) return;
  if (HOST_EXECUTING_ADAPTER_TYPES.has(agent.adapterType) || readEngine(agent.adapterConfig) === "cli") {
    throw unprocessable("This agent type cannot run in SaaS mode");
  }
}

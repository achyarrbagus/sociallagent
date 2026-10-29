import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { getAppDefinitionForApplicationKey } from "@paperclipai/shared";
import { connectorPolicyService, CUSTOM_CONNECTOR_SLUG } from "../services/connector-policy.js";
import { forbidden } from "../errors.js";
import { readManagedGatewayConfig } from "../services/managed-gateway.js";
import { isInstanceAdminRequest } from "./authz.js";

export const AI_MODELS_MANAGED_MESSAGE = "AI models are managed by your SocialAgent administrator.";

/**
 * SaaS lock: with the managed 9Router gateway configured, only an instance
 * admin chooses adapters, models and AI connections. Everyone else, board
 * users and agents alike, runs what the admin set.
 */
export function aiModelsLockedFor(req: Request) {
  return readManagedGatewayConfig() !== null && !isInstanceAdminRequest(req);
}

export function assertCanManageAiModels(req: Request) {
  if (aiModelsLockedFor(req)) throw forbidden(AI_MODELS_MANAGED_MESSAGE, { code: "ai_models_managed" });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * A locked caller's agent patch keeps the agent's adapter, model and AI
 * connection as they are; every other field still applies.
 */
export function coerceManagedAgentPatch(
  existing: { adapterType: string; adapterConfig: unknown; runtimeConfig: unknown },
  patch: Record<string, unknown>,
) {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);
  if (has("adapterType")) patch.adapterType = existing.adapterType;
  if (has("adapterConfig")) {
    const currentModel = record(existing.adapterConfig)?.model;
    const { model: _model, ...nextConfig } = record(patch.adapterConfig) ?? {};
    patch.adapterConfig = currentModel === undefined ? nextConfig : { ...nextConfig, model: currentModel };
  }
  if (has("runtimeConfig")) {
    const currentBinding = record(existing.runtimeConfig)?.aiConnection;
    const { aiConnection: _binding, ...nextRuntime } = record(patch.runtimeConfig) ?? {};
    patch.runtimeConfig = currentBinding === undefined ? nextRuntime : { ...nextRuntime, aiConnection: currentBinding };
  }
  return patch;
}

export const CONNECTOR_NOT_ALLOWED_MESSAGE = "This connector is not enabled by your SocialAgent administrator.";

/** The catalog slug for an application key, or the custom-server slug when there is none. */
export function connectorSlugFor(key: unknown) {
  if (typeof key !== "string" || !key.trim()) return CUSTOM_CONNECTOR_SLUG;
  return getAppDefinitionForApplicationKey(key)?.slug ?? key;
}

/**
 * SaaS lock for the Apps catalog: company users connect only the connectors an
 * instance admin allowed. The allowlist starts empty.
 */
export async function assertConnectorAllowed(db: Db, req: Request, slug: string) {
  if (!aiModelsLockedFor(req)) return;
  const allowed = await connectorPolicyService(db).getAllowed();
  if (!allowed.has(slug)) throw forbidden(CONNECTOR_NOT_ALLOWED_MESSAGE, { code: "connector_not_allowed", slug });
}

import type { Request } from "express";
import { companyMemberships, type Db } from "@paperclipai/db";
import { and, count, eq } from "drizzle-orm";
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

/**
 * SaaS self-serve: a signed-up user may create their own agency, up to
 * SOCIALAGENT_MAX_COMPANIES_PER_USER companies they own (default 1). Without
 * the managed gateway only instance admins create companies.
 */
export async function canSelfServeCreateCompany(db: Db, userId: string | null | undefined) {
  if (!userId || readManagedGatewayConfig() === null) return false;
  const limit = Math.max(0, Number.parseInt(process.env.SOCIALAGENT_MAX_COMPANIES_PER_USER ?? "1", 10) || 0);
  const [owned] = await db.select({ value: count() }).from(companyMemberships).where(and(
    eq(companyMemberships.principalType, "user"),
    eq(companyMemberships.principalId, userId),
    eq(companyMemberships.membershipRole, "owner"),
    eq(companyMemberships.status, "active"),
  ));
  return Number(owned?.value ?? 0) < limit;
}

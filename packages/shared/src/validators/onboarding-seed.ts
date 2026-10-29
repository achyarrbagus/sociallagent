import { z } from "zod";
import type { AiConnectionBinding } from "../ai-connections.js";
import { AGENT_ROLES, type AgentRole } from "../constants.js";

/**
 * The onboarding seed Paperclip Cloud pushes into a stack at activation
 * Every field except `revision` is customer free text collected in
 * the Cloud signup wizard, so it is untrusted input and is bounded here to the
 * same limits Cloud enforces before sending.
 *
 * The seed rides the JSON body only. The `x-paperclip-cloud-*` headers are the
 * trusted identity envelope — every member is derived server-side from host +
 * verified domain records — and must never be read for seed content.
 */
export const MISSION_MAX_LENGTH = 2000;
export const AGENT_NAME_MAX_LENGTH = 80;
export const AGENT_ROLE_MAX_LENGTH = 120;
export const FIRST_TASK_TITLE_MAX_LENGTH = 200;
export const FIRST_TASK_DETAILS_MAX_LENGTH = 2000;

export const applyOnboardingSeedSchema = z.object({
  revision: z.string().min(1).max(128),
  mission: z.string().max(MISSION_MAX_LENGTH).optional(),
  agent: z
    .object({
      name: z.string().min(1).max(AGENT_NAME_MAX_LENGTH),
      role: z.string().max(AGENT_ROLE_MAX_LENGTH).optional(),
    })
    .optional(),
  firstTask: z
    .object({
      title: z.string().min(1).max(FIRST_TASK_TITLE_MAX_LENGTH),
      details: z.string().max(FIRST_TASK_DETAILS_MAX_LENGTH).optional(),
    })
    .optional(),
});

export type ApplyOnboardingSeed = z.infer<typeof applyOnboardingSeedSchema>;

/** Body for installing the default agency team under an onboarding Agency Director. */
export const ensureAgencyTeamSchema = z.object({
  agentId: z.string().uuid(),
});

export type EnsureAgencyTeam = z.infer<typeof ensureAgencyTeamSchema>;

/**
 * Outcome of installing the default agency team. A failed install never undoes
 * onboarding: the Agency Director stays usable and the owner sees `error`.
 */
export type EnsureAgencyCoreTeamResult =
  | { status: "installed"; agentIds: string[]; warnings: string[] }
  | { status: "already_installed" }
  | { status: "failed"; error: string };

/** Adapters the instance-managed 9Router gateway can serve during onboarding. */
export const managedGatewayAdapterTypeSchema = z.enum(["claude_local", "codex_local"]);
export type ManagedGatewayAdapterType = z.infer<typeof managedGatewayAdapterTypeSchema>;

/** Body for connecting a company to the instance-managed 9Router gateway. */
export const ensureManagedGatewaySchema = z.object({
  adapterType: managedGatewayAdapterTypeSchema,
}).strict();

export type EnsureManagedGateway = z.infer<typeof ensureManagedGatewaySchema>;

/**
 * Whether the operator configured a 9Router gateway for every company. When
 * enabled, onboarding connects the first agent to it instead of asking the
 * owner for a credential. Never carries the key or the endpoint.
 */
export interface ManagedGatewayStatus {
  enabled: boolean;
  name: string;
  defaultAdapterType: ManagedGatewayAdapterType;
  /**
   * True for an instance admin. When the gateway is enabled, everyone else
   * sees agent adapters, models and AI connections read-only.
   */
  canManage: boolean;
}

/** The shared company connection onboarding binds its agents to. */
export interface EnsureManagedGatewayResult {
  binding: Extract<AiConnectionBinding, { mode: "shared" }>;
  /** The operator's default model for this adapter, when one is configured. */
  model: string | null;
}

const managedModelIdSchema = z.string().trim().min(1).max(256);

/** Admin-chosen models for one adapter: a default plus optional per-role overrides. */
export const managedAdapterModelPolicySchema = z.object({
  defaultModel: managedModelIdSchema.nullable().default(null),
  roles: z.partialRecord(z.enum(AGENT_ROLES), managedModelIdSchema).default({}),
}).strict();

/**
 * Instance-wide model policy for the managed 9Router gateway. Only an
 * instance admin reads or writes it; every agent on the managed connection
 * runs the model for its role.
 */
export const managedAiModelPolicySchema = z.object({
  claude_local: managedAdapterModelPolicySchema.default({ defaultModel: null, roles: {} }),
  codex_local: managedAdapterModelPolicySchema.default({ defaultModel: null, roles: {} }),
}).strict();

export type ManagedAdapterModelPolicy = z.infer<typeof managedAdapterModelPolicySchema>;
export type ManagedAiModelPolicy = z.infer<typeof managedAiModelPolicySchema>;

/** Admin view of the managed gateway. The key is never included. */
export interface ManagedAiAdminSettings {
  enabled: boolean;
  baseUrl: string | null;
  adapterType: ManagedGatewayAdapterType;
  policy: ManagedAiModelPolicy;
  /** The model each role runs today, after defaults and environment fallbacks. */
  effective: Record<AgentRole, string | null>;
}

export interface ManagedAiModelOption {
  id: string;
  label: string;
}

export interface ManagedAiAgentRow {
  companyId: string;
  companyName: string;
  agentId: string;
  agentName: string;
  role: string;
  adapterType: string;
  model: string | null;
  managed: boolean;
}

export interface UpdateManagedAiModelsResult {
  settings: ManagedAiAdminSettings;
  updatedAgents: number;
}

/** Result of moving existing agents onto SocialAgent AI. */
export interface AdoptManagedAiAgentsResult {
  moved: number;
  skipped: number;
  failed: { companyId: string; agentId: string | null; error: string }[];
}

/** Instance-admin allowlist of Apps catalog connectors for SaaS mode. */
export const updateAllowedConnectorsSchema = z.object({
  allowed: z.array(z.string().trim().min(1).max(160)).max(1000),
}).strict();

export type UpdateAllowedConnectors = z.infer<typeof updateAllowedConnectorsSchema>;

export interface ConnectorPolicyApp {
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  darkLogoUrl?: string;
}

export interface ConnectorPolicySettings {
  /** True when SaaS mode is on and the allowlist is enforced for company users. */
  enforced: boolean;
  allowed: string[];
  apps: ConnectorPolicyApp[];
}

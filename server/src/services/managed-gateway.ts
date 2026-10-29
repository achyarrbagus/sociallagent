import { and, eq, ne, sql } from "drizzle-orm";
import {
  agents,
  companies,
  companyMemberships,
  connectionGrants,
  instanceSettings,
  toolConnections,
  withDedicatedDbConnection,
  type Db,
} from "@paperclipai/db";
import {
  AGENT_ROLES,
  agentHarnessType,
  aiConnectionBindingSchema,
  aiProviderRoutingSchema,
  createAiConnectionSchema,
  managedAiModelPolicySchema,
  type AgentRole,
  type EnsureManagedGatewayResult,
  type ManagedAiAdminSettings,
  type ManagedAiAgentRow,
  type ManagedAiModelOption,
  type ManagedAiModelPolicy,
  type ManagedGatewayAdapterType,
  type ManagedGatewayStatus,
} from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";
import { agentService } from "./agents.js";
import { readBuiltInAgentMarker } from "../lib/built-in-agent-metadata.js";
import { aiConnectionService } from "./ai-connections.js";

export const MANAGED_GATEWAY_NAME = "9Router";
export const MANAGED_GATEWAY_DEFAULT_BASE_URL = "https://9router.amifish.com/v1";
const MANAGED_ADAPTER_TYPES: readonly ManagedGatewayAdapterType[] = ["claude_local", "codex_local"];
const SETTINGS_KEY = "default";
/** Local harnesses an agent can leave for the managed gateway without losing anything it needs. */
const ADOPTABLE_HARNESSES = new Set([
  "claude_local", "codex_local", "opencode_local", "pi_local", "gemini_local", "cursor", "grok_local", "kimi_local", "hermes_local",
]);

export interface ManagedGatewayConfig {
  apiKey: string;
  baseUrl: string;
  defaultAdapterType: ManagedGatewayAdapterType;
  models: Record<ManagedGatewayAdapterType, string | null>;
}

/**
 * The operator's 9Router gateway, read from the server environment. The key
 * never leaves the server: it is stored as a company-scoped shared connection
 * secret so owners never enter a credential themselves.
 */
export function readManagedGatewayConfig(env: NodeJS.ProcessEnv = process.env): ManagedGatewayConfig | null {
  const apiKey = env.SOCIALAGENT_9ROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const model = (value: string | undefined) => value?.trim() || null;
  return {
    apiKey,
    baseUrl: env.SOCIALAGENT_9ROUTER_BASE_URL?.trim() || MANAGED_GATEWAY_DEFAULT_BASE_URL,
    defaultAdapterType: env.SOCIALAGENT_9ROUTER_ADAPTER?.trim() === "codex_local" ? "codex_local" : "claude_local",
    models: {
      claude_local: model(env.SOCIALAGENT_9ROUTER_CLAUDE_MODEL),
      codex_local: model(env.SOCIALAGENT_9ROUTER_CODEX_MODEL),
    },
  };
}

export function isManagedAdapterType(value: unknown): value is ManagedGatewayAdapterType {
  return MANAGED_ADAPTER_TYPES.includes(value as ManagedGatewayAdapterType);
}

/**
 * The managed harness an agent runs, whether on the legacy adapter or on the
 * native runner (`paperclip_runner` with a Claude or Codex provider).
 */
export function managedHarnessOf(adapterType: string, adapterConfig: unknown): ManagedGatewayAdapterType | null {
  const config = adapterConfig && typeof adapterConfig === "object" ? adapterConfig as Record<string, unknown> : {};
  const harness = agentHarnessType(adapterType, config);
  const normalized = harness === "claude" ? "claude_local" : harness === "codex" ? "codex_local" : harness;
  return isManagedAdapterType(normalized) ? normalized : null;
}

function managedConnectionName(adapterType: ManagedGatewayAdapterType) {
  return `${MANAGED_GATEWAY_NAME} (${adapterType === "codex_local" ? "Codex" : "Claude"})`;
}

function protocolFor(adapterType: ManagedGatewayAdapterType) {
  return adapterType === "codex_local" ? "responses" as const : "messages" as const;
}

function providerFor(adapterType: ManagedGatewayAdapterType) {
  return adapterType === "codex_local" ? "openai" as const : "anthropic" as const;
}

function asAgentRole(role: unknown): AgentRole {
  return AGENT_ROLES.includes(role as AgentRole) ? role as AgentRole : "general";
}

/** Role override, then the adapter default, then the operator's environment model. */
export function resolveManagedModel(
  policy: ManagedAiModelPolicy,
  config: ManagedGatewayConfig,
  adapterType: ManagedGatewayAdapterType,
  role: unknown,
): string | null {
  const adapter = policy[adapterType];
  return adapter.roles[asAgentRole(role)] ?? adapter.defaultModel ?? config.models[adapterType];
}

type ManagedBinding = EnsureManagedGatewayResult["binding"];

export function managedGatewayService(db: Db, readConfig: () => ManagedGatewayConfig | null = () => readManagedGatewayConfig()) {
  const connections = aiConnectionService(db);
  const agentsSvc = agentService(db);

  function enabled() {
    return readConfig() !== null;
  }

  function status(canManage: boolean): ManagedGatewayStatus {
    const config = readConfig();
    return {
      enabled: Boolean(config),
      name: MANAGED_GATEWAY_NAME,
      defaultAdapterType: config?.defaultAdapterType ?? "claude_local",
      canManage,
    };
  }

  function requireConfig() {
    const config = readConfig();
    if (!config) throw unprocessable("The managed 9Router gateway is not configured on this instance.");
    return config;
  }

  function routingFor(config: ManagedGatewayConfig, adapterType: ManagedGatewayAdapterType) {
    const parsed = aiProviderRoutingSchema.safeParse({
      kind: "gateway",
      protocol: protocolFor(adapterType),
      auth: "bearer",
      baseUrl: config.baseUrl,
      models: [],
    });
    if (!parsed.success) {
      throw unprocessable("SOCIALAGENT_9ROUTER_BASE_URL must be an HTTPS URL, or HTTP on localhost.");
    }
    return parsed.data;
  }

  async function getPolicy(): Promise<ManagedAiModelPolicy> {
    const [row] = await db
      .select({ aiModels: instanceSettings.aiModels })
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, SETTINGS_KEY));
    const parsed = managedAiModelPolicySchema.safeParse(row?.aiModels ?? {});
    return parsed.success ? parsed.data : managedAiModelPolicySchema.parse({});
  }

  async function savePolicy(policy: ManagedAiModelPolicy) {
    const now = new Date();
    await db
      .insert(instanceSettings)
      .values({ singletonKey: SETTINGS_KEY, general: {}, experimental: {}, aiModels: policy, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [instanceSettings.singletonKey], set: { aiModels: policy, updatedAt: now } });
  }

  async function modelFor(adapterType: ManagedGatewayAdapterType, role: unknown) {
    return resolveManagedModel(await getPolicy(), requireConfig(), adapterType, role);
  }

  /** The company's active managed connection for an adapter, if onboarding created one. */
  async function findConnection(
    runner: Db,
    companyId: string,
    adapterType: ManagedGatewayAdapterType,
    baseUrl: string,
  ): Promise<ManagedBinding | null> {
    const [existing] = await runner
      .select({ connectionId: toolConnections.id, grantId: connectionGrants.id })
      .from(toolConnections)
      .innerJoin(connectionGrants, and(
        eq(connectionGrants.connectionId, toolConnections.id),
        eq(connectionGrants.companyId, companyId),
      ))
      .where(and(
        eq(toolConnections.companyId, companyId),
        eq(toolConnections.connectionPurpose, "ai"),
        eq(toolConnections.name, managedConnectionName(adapterType)),
        eq(toolConnections.status, "active"),
        eq(toolConnections.enabled, true),
        eq(connectionGrants.kind, "organization"),
        eq(connectionGrants.status, "active"),
        sql`${toolConnections.config}->'ai'->'routing'->>'baseUrl' = ${baseUrl}`,
        sql`${toolConnections.config}->'ai'->'routing'->>'protocol' = ${protocolFor(adapterType)}`,
      ))
      .limit(1);
    if (!existing) return null;
    return { provider: providerFor(adapterType), method: "api_key", mode: "shared", ...existing };
  }

  /**
   * Returns the company's shared managed binding, creating it once when a
   * member user is available. A repeat call reuses the active connection, so
   * the key is never stored twice.
   */
  async function connectionFor(
    companyId: string,
    adapterType: ManagedGatewayAdapterType,
    userId: string | null,
  ): Promise<ManagedBinding> {
    const config = requireConfig();
    const routing = routingFor(config, adapterType);
    const lockKey = `socialagent:managed-gateway:${companyId}:${adapterType}`;
    return withDedicatedDbConnection(db, (lockDb) => lockDb.transaction(async (lock) => {
      await lock.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const existing = await findConnection(db, companyId, adapterType, routing.baseUrl!);
      if (existing) return existing;
      if (!userId) throw conflict("SocialAgent AI is not connected for this company yet. Ask a company owner to finish onboarding.");
      const saved = await connections.save(
        companyId,
        userId,
        createAiConnectionSchema.parse({
          provider: providerFor(adapterType),
          method: "api_key",
          name: managedConnectionName(adapterType),
          ownership: "shared",
          allAgents: true,
          agentIds: [],
          routing,
          apiKey: config.apiKey,
        }),
        config.apiKey,
      );
      return { provider: providerFor(adapterType), method: "api_key", mode: "shared", ...saved };
    }));
  }

  /** Onboarding: the Director's binding and model. */
  async function ensure(
    companyId: string,
    userId: string,
    adapterType: ManagedGatewayAdapterType,
  ): Promise<EnsureManagedGatewayResult> {
    const binding = await connectionFor(companyId, adapterType, userId);
    return { binding, model: await modelFor(adapterType, "ceo") };
  }

  /**
   * What a new agent must run on when models are admin-managed: the managed
   * adapter, the model for its role and the company's shared connection.
   */
  async function hireDefaults(companyId: string, role: unknown, userId: string | null) {
    const config = requireConfig();
    const adapterType = config.defaultAdapterType;
    const binding = await connectionFor(companyId, adapterType, userId);
    return { adapterType, model: await modelFor(adapterType, role), binding };
  }

  async function managedConnectionIds(): Promise<Set<string>> {
    const config = readConfig();
    if (!config) return new Set();
    const rows = await db
      .select({ id: toolConnections.id })
      .from(toolConnections)
      .where(and(
        eq(toolConnections.connectionPurpose, "ai"),
        sql`${toolConnections.name} in (${managedConnectionName("claude_local")}, ${managedConnectionName("codex_local")})`,
        sql`${toolConnections.config}->'ai'->'routing'->>'baseUrl' = ${config.baseUrl}`,
      ));
    return new Set(rows.map((row) => row.id));
  }

  function boundConnectionId(runtimeConfig: Record<string, unknown> | null | undefined) {
    const parsed = aiConnectionBindingSchema.safeParse(runtimeConfig?.aiConnection);
    return parsed.success && parsed.data.mode !== "responsible_user" ? parsed.data.connectionId : null;
  }

  /**
   * Binds the given agents (for example a freshly installed team) to the
   * company's managed connection and gives each the model for its role.
   * Agents on an adapter the gateway cannot serve are left untouched.
   */
  async function applyToAgents(companyId: string, agentIds: string[]): Promise<string[]> {
    const config = readConfig();
    if (!config || agentIds.length === 0) return [];
    const policy = await getPolicy();
    const warnings: string[] = [];
    const bindings = new Map<ManagedGatewayAdapterType, ManagedBinding | null>();
    for (const agentId of agentIds) {
      try {
        const agent = await agentsSvc.getById(agentId);
        const harness = agent && agent.companyId === companyId ? managedHarnessOf(agent.adapterType, agent.adapterConfig) : null;
        if (!agent || !harness) continue;
        if (!bindings.has(harness)) {
          bindings.set(harness, await findConnection(db, companyId, harness, routingFor(config, harness).baseUrl!));
        }
        const binding = bindings.get(harness);
        if (!binding) continue;
        const model = resolveManagedModel(policy, config, harness, agent.role);
        await agentsSvc.update(agentId, {
          adapterConfig: { ...(agent.adapterConfig ?? {}), ...(model ? { model } : {}) },
          runtimeConfig: { ...(agent.runtimeConfig ?? {}), aiConnection: binding },
        });
      } catch (error) {
        warnings.push(`Could not apply SocialAgent AI to agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return warnings;
  }

  /** Re-applies the policy to every agent on a managed connection, in every company. */
  async function applyPolicyEverywhere(): Promise<number> {
    const config = readConfig();
    if (!config) return 0;
    const policy = await getPolicy();
    const managedIds = await managedConnectionIds();
    if (managedIds.size === 0) return 0;
    const rows = await db.select().from(agents).where(ne(agents.status, "terminated"));
    let updated = 0;
    for (const agent of rows) {
      const connectionId = boundConnectionId(agent.runtimeConfig);
      const harness = managedHarnessOf(agent.adapterType, agent.adapterConfig);
      if (!connectionId || !managedIds.has(connectionId) || !harness) continue;
      const model = resolveManagedModel(policy, config, harness, agent.role);
      const current = (agent.adapterConfig as Record<string, unknown> | null)?.model;
      if (!model || current === model) continue;
      await agentsSvc.update(agent.id, { adapterConfig: { ...(agent.adapterConfig ?? {}), model } });
      updated += 1;
    }
    return updated;
  }

  /**
   * Moves every agent that is not yet on SocialAgent AI onto it: the managed
   * adapter (unless it already runs that harness), the model for its role and
   * the company's shared connection. Built-in and plugin agents, and agents
   * on remote or custom adapters, are skipped.
   */
  async function adoptAllAgents(adminUserId: string | null) {
    const config = requireConfig();
    const policy = await getPolicy();
    const managedIds = await managedConnectionIds();
    const rows = await db.select().from(agents).where(ne(agents.status, "terminated"));
    const byCompany = new Map<string, typeof rows>();
    for (const agent of rows) byCompany.set(agent.companyId, [...(byCompany.get(agent.companyId) ?? []), agent]);
    const result = { moved: 0, skipped: 0, failed: [] as { companyId: string; agentId: string | null; error: string }[], companyIds: [] as string[] };
    for (const [companyId, companyAgents] of byCompany) {
      const candidates = companyAgents.filter((agent) => {
        const connectionId = boundConnectionId(agent.runtimeConfig);
        if (connectionId && managedIds.has(connectionId)) return false;
        const metadata = agent.metadata as Record<string, unknown> | null;
        const harness = agentHarnessType(agent.adapterType, (agent.adapterConfig ?? {}) as Record<string, unknown>);
        const adoptable = !readBuiltInAgentMarker(metadata) && !metadata?.pluginManagedAgent
          && ADOPTABLE_HARNESSES.has(harness === "claude" ? "claude_local" : harness === "codex" ? "codex_local" : harness);
        if (!adoptable) result.skipped += 1;
        return adoptable;
      });
      if (candidates.length === 0) continue;
      let binding: ManagedBinding;
      try {
        const members = await db
          .select({ userId: companyMemberships.principalId, role: companyMemberships.membershipRole })
          .from(companyMemberships)
          .where(and(
            eq(companyMemberships.companyId, companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.status, "active"),
          ));
        const owner = members.find((m) => m.userId === adminUserId)
          ?? members.find((m) => m.role === "owner")
          ?? members.find((m) => m.role !== "viewer");
        binding = await connectionFor(companyId, config.defaultAdapterType, owner?.userId ?? null);
      } catch (error) {
        result.failed.push({ companyId, agentId: null, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      result.companyIds.push(companyId);
      for (const agent of candidates) {
        try {
          const sameHarness = managedHarnessOf(agent.adapterType, agent.adapterConfig) === config.defaultAdapterType;
          const { model: _model, ...kept } = sameHarness ? (agent.adapterConfig ?? {}) as Record<string, unknown> : {};
          const model = resolveManagedModel(policy, config, config.defaultAdapterType, agent.role);
          await agentsSvc.update(agent.id, {
            ...(sameHarness ? {} : { adapterType: config.defaultAdapterType }),
            adapterConfig: { ...kept, ...(model ? { model } : {}) },
            runtimeConfig: { ...((agent.runtimeConfig ?? {}) as Record<string, unknown>), aiConnection: binding },
          });
          result.moved += 1;
        } catch (error) {
          result.failed.push({ companyId, agentId: agent.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return result;
  }

  async function adminSettings(): Promise<ManagedAiAdminSettings> {
    const config = readConfig();
    const policy = await getPolicy();
    const adapterType = config?.defaultAdapterType ?? "claude_local";
    const effective = Object.fromEntries(AGENT_ROLES.map((role) => [
      role,
      config ? resolveManagedModel(policy, config, adapterType, role) : null,
    ])) as Record<AgentRole, string | null>;
    return { enabled: Boolean(config), baseUrl: config?.baseUrl ?? null, adapterType, policy, effective };
  }

  async function updatePolicy(input: ManagedAiModelPolicy) {
    await savePolicy(managedAiModelPolicySchema.parse(input));
    const updatedAgents = await applyPolicyEverywhere();
    return { settings: await adminSettings(), updatedAgents };
  }

  /** Models the gateway offers, fetched with the operator key on the server. */
  async function catalog(): Promise<ManagedAiModelOption[]> {
    const config = requireConfig();
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    }).catch((error: unknown) => {
      throw unprocessable(`Could not reach 9Router: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!response.ok) throw unprocessable(`9Router returned ${response.status} for the model list.`);
    const body = await response.json().catch(() => null) as { data?: Array<{ id?: unknown; name?: unknown }> } | null;
    return (body?.data ?? [])
      .filter((entry): entry is { id: string; name?: unknown } => typeof entry.id === "string" && entry.id.length > 0)
      .map((entry) => ({ id: entry.id, label: typeof entry.name === "string" && entry.name ? entry.name : entry.id }));
  }

  async function agentsOverview(): Promise<ManagedAiAgentRow[]> {
    const managedIds = await managedConnectionIds();
    const rows = await db
      .select({ agent: agents, companyName: companies.name })
      .from(agents)
      .innerJoin(companies, eq(companies.id, agents.companyId))
      .where(ne(agents.status, "terminated"));
    return rows
      .map(({ agent, companyName }) => {
        const connectionId = boundConnectionId(agent.runtimeConfig);
        const model = (agent.adapterConfig as Record<string, unknown> | null)?.model;
        return {
          companyId: agent.companyId,
          companyName,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          adapterType: agent.adapterType,
          model: typeof model === "string" && model ? model : null,
          managed: Boolean(connectionId && managedIds.has(connectionId)),
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName) || a.agentName.localeCompare(b.agentName));
  }

  return {
    enabled,
    status,
    ensure,
    hireDefaults,
    applyToAgents,
    applyPolicyEverywhere,
    adminSettings,
    updatePolicy,
    catalog,
    agentsOverview,
    managedConnectionIds,
    adoptAllAgents,
  };
}

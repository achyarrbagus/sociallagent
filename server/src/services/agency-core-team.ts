import { sql } from "drizzle-orm";
import { withDedicatedDbConnection, type Db } from "@paperclipai/db";
import {
  agentHarnessType,
  aiConnectionBindingSchema,
  paperclipRunnerProfileForHarness,
  type CompanyPortabilityAdapterOverride,
  type EnsureAgencyCoreTeamResult,
} from "@paperclipai/shared";
import { findServerAdapter } from "../adapters/index.js";
import { conflict, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { agentService } from "./agents.js";
import { managedGatewayService } from "./managed-gateway.js";
import { resolvePaperclipRunnerProviderProfile } from "./native-runtime/provider-profile.js";
import {
  readCatalogTeamProvenance,
  teamsCatalogService,
  type CatalogTeamActorContext,
} from "./teams-catalog.js";

export type { EnsureAgencyCoreTeamResult };

export const AGENCY_CORE_TEAM_KEY = "paperclipai/bundled/company-defaults/agency-core";

const INACTIVE_DIRECTOR_STATES = new Set(["terminated", "terminating", "cleaning_up", "rejected"]);

/**
 * Adapters a safe catalog import cannot recreate from a model alone: `process`
 * and `http` are forbidden in safe imports, and `openclaw_gateway` needs the
 * Director's gateway URL and auth, which are never copied.
 */
const NON_INHERITABLE_ADAPTER_TYPES = new Set(["process", "http", "openclaw_gateway"]);

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Installs the default agency team under a company's onboarding Agency
 * Director. The Director is adopted into the team's manager slot, so the team
 * heads report to her and the recurring director review is hers; only the
 * specialists are created.
 *
 * A failed install never undoes onboarding. Director validation errors are
 * thrown (the caller asked for something invalid), but anything the install
 * itself throws is logged and returned as `failed` so the owner keeps a usable
 * Director and sees why the team is missing.
 */
export function agencyCoreTeamService(db: Db) {
  const agents = agentService(db);
  const managedGateway = managedGatewayService(db);

  async function loadDirector(companyId: string, directorAgentId: string) {
    const director = await agents.getById(directorAgentId);
    if (
      !director
      || director.companyId !== companyId
      || director.role !== "ceo"
      || INACTIVE_DIRECTOR_STATES.has(director.status)
      || INACTIVE_DIRECTOR_STATES.has(director.lifecycleState ?? "")
    ) {
      throw unprocessable("Agent must be an active Agency Director in this company.");
    }
    if (director.status === "pending_approval" || director.lifecycleState === "pending_approval") {
      throw conflict("Agency Director is waiting for approval.");
    }
    return director;
  }

  /**
   * Specialists run on the Director's harness, runner and model. Agents carry
   * no runner column: a `paperclip_runner` Director on a harness with a legacy
   * twin (Codex, Claude, OpenCode, Pi) is expressed as that harness plus the
   * `paperclip` runner, so a Claude Director yields Claude specialists rather
   * than the runner's default provider. Other runner harnesses (for example
   * ACPX Copilot) keep `paperclip_runner` with only the routing keys. No other
   * adapter configuration (workspace, env, prompts, credentials) is copied.
   *
   * Returns null when the Director's adapter cannot be recreated by a safe
   * import; the catalog's safe default adapter then applies instead.
   */
  function specialistAdapterOverride(director: {
    adapterType: string;
    adapterConfig: Record<string, unknown> | null;
  }): CompanyPortabilityAdapterOverride | null {
    const config = director.adapterConfig ?? {};
    const model = typeof config.model === "string" ? { model: config.model } : {};
    if (director.adapterType === "paperclip_runner") {
      const harness = agentHarnessType(director.adapterType, config);
      if (paperclipRunnerProfileForHarness(harness)) {
        return { adapterType: harness, runner: "paperclip", adapterConfig: model };
      }
      const routing: Record<string, unknown> = { ...model };
      for (const key of ["provider", "acpxAgent"] as const) {
        if (config[key] !== undefined) routing[key] = config[key];
      }
      try {
        // Providers that need more than routing (managed profiles, bindings)
        // cannot be recreated here.
        resolvePaperclipRunnerProviderProfile(routing);
      } catch {
        return null;
      }
      return { adapterType: "paperclip_runner", runner: "paperclip", adapterConfig: routing };
    }
    if (NON_INHERITABLE_ADAPTER_TYPES.has(director.adapterType) || !findServerAdapter(director.adapterType)) {
      return null;
    }
    return { adapterType: director.adapterType, runner: "legacy", adapterConfig: model };
  }

  /**
   * Specialists on the Director's harness run on her company-shared AI
   * connection (for example the instance-managed 9Router gateway), so the
   * owner never connects each one. Personal and delegated bindings stay hers:
   * they authorize one human's credential and are never copied.
   */
  async function shareDirectorConnection(
    director: { runtimeConfig: Record<string, unknown> | null },
    agentIds: string[],
  ): Promise<string[]> {
    const parsed = aiConnectionBindingSchema.safeParse(director.runtimeConfig?.aiConnection);
    if (!parsed.success || parsed.data.mode !== "shared") return [];
    const warnings: string[] = [];
    for (const agentId of agentIds) {
      try {
        const agent = await agents.getById(agentId);
        if (!agent) continue;
        await agents.update(agentId, {
          runtimeConfig: { ...(agent.runtimeConfig ?? {}), aiConnection: parsed.data },
        });
      } catch (error) {
        warnings.push(`Could not connect agent ${agentId} to the Director's AI connection: ${formatError(error)}`);
      }
    }
    return warnings;
  }

  async function logInstallFailure(
    companyId: string,
    directorAgentId: string,
    actor: CatalogTeamActorContext,
    error: string,
  ) {
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId ?? null,
      runId: actor.runId ?? null,
      action: "company.agency_core_team_install_failed",
      entityType: "company",
      entityId: companyId,
      details: { directorAgentId, error },
    });
  }

  async function install(
    companyId: string,
    director: Awaited<ReturnType<typeof loadDirector>>,
    actor: CatalogTeamActorContext,
  ): Promise<EnsureAgencyCoreTeamResult> {
    const catalog = teamsCatalogService(db);
    try {
      const team = await catalog.getCatalogTeamOrThrow(AGENCY_CORE_TEAM_KEY);
      const specialistSlugs = team.agentSlugs.filter((slug) => !team.rootAgentSlugs.includes(slug));
      // Provenance alone is not enough: the import is not transactional, so a
      // failed install can leave some specialists behind. Only a full team
      // counts as installed, and a partial one is never reinstalled because
      // the import would duplicate the agents that are already there.
      const existingSpecialists = (await agents.list(companyId)).filter((agent) =>
        agent.id !== director.id
        && agent.status !== "terminated"
        && !INACTIVE_DIRECTOR_STATES.has(agent.lifecycleState ?? "")
        && readCatalogTeamProvenance(agent.metadata as Record<string, unknown> | null)?.catalogKey
          === AGENCY_CORE_TEAM_KEY);
      if (existingSpecialists.length >= specialistSlugs.length) {
        return { status: "already_installed" };
      }
      if (existingSpecialists.length > 0) {
        throw new Error(
          `The agency team is only partially installed (${existingSpecialists.length} of ${specialistSlugs.length} agents). `
            + "Remove the partial agents or add the missing ones from the Team Catalog.",
        );
      }
      const override = specialistAdapterOverride(director);
      const adapterOverrides = override
        ? Object.fromEntries(
          specialistSlugs.map((slug) => [slug, { ...override, adapterConfig: { ...override.adapterConfig } }]),
        )
        : undefined;
      const result = await catalog.installCatalogTeam(companyId, AGENCY_CORE_TEAM_KEY, {
        adoptManagerAgentId: director.id,
        adapterOverrides,
        actor,
      });
      const agentIds = result.portabilityImport.agents
        .filter((agent) => agent.action === "created" && agent.id)
        .map((agent) => agent.id as string);
      // Admin-managed models: every specialist runs the company's managed
      // connection with the model for its role. Otherwise specialists on the
      // Director's harness share her company connection.
      const connectionWarnings = managedGateway.enabled()
        ? await managedGateway.applyToAgents(companyId, agentIds)
        : override ? await shareDirectorConnection(director, agentIds) : [];
      return { status: "installed", agentIds, warnings: [...result.warnings, ...connectionWarnings] };
    } catch (error) {
      const message = formatError(error);
      await logInstallFailure(companyId, director.id, actor, message);
      return { status: "failed", error: message };
    }
  }

  async function ensureInstalled(
    companyId: string,
    directorAgentId: string,
    actor: CatalogTeamActorContext,
  ): Promise<EnsureAgencyCoreTeamResult> {
    const director = await loadDirector(companyId, directorAgentId);
    // Onboarding can reach this from the seed push and the board at once, and
    // Cloud may replay the seed concurrently. The per-company lock makes the
    // installed-check and the install one step, so the team lands once.
    const lockKey = `paperclip:agency-core-team:${companyId}`;
    return withDedicatedDbConnection(db, (lockDb) => lockDb.transaction(async (lock) => {
      await lock.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      return install(companyId, director, actor);
    }));
  }

  /**
   * Onboarding variant that never throws: a rejected Director (pending
   * approval, wrong company or role) is a failed install like any other, so it
   * is logged once and returned as `failed` instead of failing the caller.
   */
  async function ensureInstalledOrReportFailure(
    companyId: string,
    directorAgentId: string,
    actor: CatalogTeamActorContext,
  ): Promise<EnsureAgencyCoreTeamResult> {
    try {
      // Install-time failures are already logged and returned as `failed`.
      return await ensureInstalled(companyId, directorAgentId, actor);
    } catch (error) {
      const message = formatError(error);
      await logInstallFailure(companyId, directorAgentId, actor, message).catch(() => undefined);
      return { status: "failed", error: message };
    }
  }

  /**
   * Records an install the caller decided not to attempt (for example, an
   * actor without `agents:create`) as a failed onboarding install.
   */
  async function reportFailure(
    companyId: string,
    directorAgentId: string,
    actor: CatalogTeamActorContext,
    error: string,
  ): Promise<EnsureAgencyCoreTeamResult> {
    await logInstallFailure(companyId, directorAgentId, actor, error).catch(() => undefined);
    return { status: "failed", error };
  }

  return { ensureInstalled, ensureInstalledOrReportFailure, reportFailure };
}

import { sql } from "drizzle-orm";
import { withDedicatedDbConnection, type Db } from "@paperclipai/db";
import {
  agentHarnessType,
  agentRunner,
  type CompanyPortabilityAdapterOverride,
  type EnsureAgencyCoreTeamResult,
} from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { agentService } from "./agents.js";
import { teamsCatalogService, type CatalogTeamActorContext } from "./teams-catalog.js";

export type { EnsureAgencyCoreTeamResult };

export const AGENCY_CORE_TEAM_KEY = "paperclipai/bundled/company-defaults/agency-core";

const INACTIVE_DIRECTOR_STATES = new Set(["terminated", "terminating", "cleaning_up", "rejected"]);

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
   * no runner column: a `paperclip_runner` Director is expressed as her harness
   * plus the `paperclip` runner, so a Claude Director yields Claude
   * specialists rather than the runner's default provider. No other adapter
   * configuration (workspace, env, prompts) is copied.
   */
  function specialistAdapterOverride(director: {
    adapterType: string;
    adapterConfig: Record<string, unknown> | null;
  }): CompanyPortabilityAdapterOverride {
    const config = director.adapterConfig ?? {};
    const model = config.model;
    return {
      adapterType: agentHarnessType(director.adapterType, config),
      runner: agentRunner(director.adapterType),
      adapterConfig: typeof model === "string" ? { model } : {},
    };
  }

  async function install(
    companyId: string,
    director: Awaited<ReturnType<typeof loadDirector>>,
    actor: CatalogTeamActorContext,
  ): Promise<EnsureAgencyCoreTeamResult> {
    const catalog = teamsCatalogService(db);
    try {
      const installed = await catalog.listInstalledCatalogTeams(companyId);
      if (installed.some((team) => team.catalogKey === AGENCY_CORE_TEAM_KEY)) {
        return { status: "already_installed" };
      }
      const team = await catalog.getCatalogTeamOrThrow(AGENCY_CORE_TEAM_KEY);
      const override = specialistAdapterOverride(director);
      const adapterOverrides = Object.fromEntries(
        team.agentSlugs
          .filter((slug) => !team.rootAgentSlugs.includes(slug))
          .map((slug) => [slug, { ...override, adapterConfig: { ...override.adapterConfig } }]),
      );
      const result = await catalog.installCatalogTeam(companyId, AGENCY_CORE_TEAM_KEY, {
        adoptManagerAgentId: director.id,
        adapterOverrides,
        actor,
      });
      const agentIds = result.portabilityImport.agents
        .filter((agent) => agent.action === "created" && agent.id)
        .map((agent) => agent.id as string);
      return { status: "installed", agentIds, warnings: result.warnings };
    } catch (error) {
      const message = formatError(error);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        runId: actor.runId ?? null,
        action: "company.agency_core_team_install_failed",
        entityType: "company",
        entityId: companyId,
        details: { directorAgentId: director.id, error: message },
      });
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

  return { ensureInstalled };
}

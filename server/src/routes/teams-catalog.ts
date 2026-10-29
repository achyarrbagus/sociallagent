import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  catalogTeamInstallSchema,
  catalogTeamListQuerySchema,
  catalogTeamPreviewSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { accessService, agentService } from "../services/index.js";
import {
  getCatalogTeamOrThrow,
  listCatalogTeams,
  readCatalogTeamFile,
  teamsCatalogService,
} from "../services/teams-catalog.js";
import { forbidden } from "../errors.js";
import { managedGatewayService } from "../services/managed-gateway.js";
import { aiModelsLockedFor } from "./managed-ai-lock.js";
import { assertAuthenticated, assertBoardCanCreateAgents, assertCompanyAccess, getActorInfo } from "./authz.js";

export function teamsCatalogRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);
  const access = accessService(db);
  const svc = teamsCatalogService(db);

  function canCreateAgents(agent: { permissions: Record<string, unknown> | null | undefined }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  function firstQueryString(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    return undefined;
  }

  async function assertCanInstallCatalogTeam(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);

    if (req.actor.type === "board") {
      await assertBoardCanCreateAgents(req, companyId, access);
      return;
    }

    if (!req.actor.agentId) {
      throw forbidden("Agent authentication required");
    }

    const actorAgent = await agents.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }

    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    if (allowedByGrant || canCreateAgents(actorAgent)) {
      return;
    }

    throw forbidden("Missing permission: can create agents");
  }

  router.get("/teams/catalog", async (req, res) => {
    assertAuthenticated(req);
    const query = catalogTeamListQuerySchema.parse({
      kind: firstQueryString(req.query.kind),
      category: firstQueryString(req.query.category),
      q: firstQueryString(req.query.q),
    });
    res.json(await listCatalogTeams(query));
  });

  router.get("/teams/catalog/:catalogId/files", async (req, res) => {
    assertAuthenticated(req);
    const catalogRef = firstQueryString(req.query.ref) ?? (req.params.catalogId as string);
    const relativePath = firstQueryString(req.query.path) ?? "TEAM.md";
    res.json(await readCatalogTeamFile(catalogRef, relativePath));
  });

  router.get("/teams/catalog/:catalogId", async (req, res) => {
    assertAuthenticated(req);
    const catalogRef = firstQueryString(req.query.ref) ?? (req.params.catalogId as string);
    res.json(await getCatalogTeamOrThrow(catalogRef));
  });

  router.get("/companies/:companyId/teams/catalog/installed", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.listInstalledCatalogTeams(companyId));
  });

  router.post(
    "/companies/:companyId/teams/catalog/:catalogId/preview",
    validate(catalogTeamPreviewSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const catalogRef = firstQueryString(req.query.ref) ?? (req.params.catalogId as string);
      assertCompanyAccess(req, companyId);
      const result = await svc.previewCatalogTeamImport(companyId, catalogRef, {
        ...req.body,
        actor: getActorInfo(req),
      });
      res.json(result);
    },
  );

  router.post(
    "/companies/:companyId/teams/catalog/:catalogId/install",
    validate(catalogTeamInstallSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const catalogRef = firstQueryString(req.query.ref) ?? (req.params.catalogId as string);
      await assertCanInstallCatalogTeam(req, companyId);
      // Admin-managed models: a non-admin cannot choose adapters for the team.
      const { adapterOverrides, ...body } = req.body;
      const result = await svc.installCatalogTeam(companyId, catalogRef, {
        ...body,
        ...(aiModelsLockedFor(req) ? {} : { adapterOverrides }),
        actor: getActorInfo(req),
      });
      const managedGateway = managedGatewayService(db);
      if (managedGateway.enabled()) {
        const agentIds = result.portabilityImport.agents
          .filter((agent) => agent.action === "created" && agent.id)
          .map((agent) => agent.id as string);
        result.warnings.push(...await managedGateway.applyToAgents(companyId, agentIds));
      }
      res.status(201).json(result);
    },
  );

  return router;
}

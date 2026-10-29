import { Router } from "express";
import { companies, type Db } from "@paperclipai/db";
import { managedAiModelPolicySchema, updateAllowedConnectorsSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { managedGatewayService } from "../services/managed-gateway.js";
import { connectorPolicyCatalog, connectorPolicyService } from "../services/connector-policy.js";
import { assertInstanceAdmin, getActorInfo } from "./authz.js";

/**
 * Instance-admin control of the managed 9Router gateway: the model each agent
 * role runs, the gateway's model list and every agent's current model. The
 * key itself stays in the server environment and is never returned.
 */
export function managedAiAdminRoutes(db: Db, options: { managedGateway?: ReturnType<typeof managedGatewayService> } = {}) {
  const router = Router();
  const managedGateway = options.managedGateway ?? managedGatewayService(db);

  router.get("/instance/settings/ai-models", async (req, res) => {
    assertInstanceAdmin(req);
    res.json(await managedGateway.adminSettings());
  });

  router.put("/instance/settings/ai-models", validate(managedAiModelPolicySchema), async (req, res) => {
    assertInstanceAdmin(req);
    const result = await managedGateway.updatePolicy(req.body);
    const actor = getActorInfo(req);
    const companyRows = await db.select({ id: companies.id }).from(companies);
    await Promise.all(companyRows.map(({ id }) => logActivity(db, {
      companyId: id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "instance.settings.ai_models_updated",
      entityType: "instance_settings",
      entityId: "ai-models",
      details: { policy: result.settings.policy, updatedAgents: result.updatedAgents },
    })));
    res.json(result);
  });

  router.post("/instance/ai-models/adopt", async (req, res) => {
    assertInstanceAdmin(req);
    const actor = getActorInfo(req);
    const result = await managedGateway.adoptAllAgents(actor.actorType === "user" ? actor.actorId : null);
    await Promise.all(result.companyIds.map((companyId) => logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "instance.ai_models.agents_adopted",
      entityType: "instance_settings",
      entityId: "ai-models",
      details: { moved: result.moved, skipped: result.skipped, failed: result.failed.filter((f) => f.companyId === companyId).length },
    })));
    const { companyIds: _companyIds, ...body } = result;
    res.json(body);
  });

  router.get("/instance/settings/connectors", async (req, res) => {
    assertInstanceAdmin(req);
    res.json({
      enforced: managedGateway.enabled(),
      allowed: [...await connectorPolicyService(db).getAllowed()].sort(),
      apps: connectorPolicyCatalog(),
    });
  });

  router.put("/instance/settings/connectors", validate(updateAllowedConnectorsSchema), async (req, res) => {
    assertInstanceAdmin(req);
    const allowed = await connectorPolicyService(db).setAllowed(req.body.allowed);
    const actor = getActorInfo(req);
    const companyRows = await db.select({ id: companies.id }).from(companies);
    await Promise.all(companyRows.map(({ id }) => logActivity(db, {
      companyId: id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "instance.settings.connectors_updated",
      entityType: "instance_settings",
      entityId: "connectors",
      details: { allowed },
    })));
    res.json({ enforced: managedGateway.enabled(), allowed, apps: connectorPolicyCatalog() });
  });

  router.get("/instance/ai-models/catalog", async (req, res) => {
    assertInstanceAdmin(req);
    res.json(await managedGateway.catalog());
  });

  router.get("/instance/ai-models/agents", async (req, res) => {
    assertInstanceAdmin(req);
    res.json(await managedGateway.agentsOverview());
  });

  return router;
}

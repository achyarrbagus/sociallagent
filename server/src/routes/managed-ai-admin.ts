import { Router, type Request, type Response } from "express";
import { companies, type Db } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { managedAiModelPolicySchema, updateAllowedConnectorsSchema, updateTenantBudgetSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { managedGatewayService } from "../services/managed-gateway.js";
import { companyService } from "../services/companies.js";
import { notFound } from "../errors.js";
import { connectorPolicyCatalog, connectorPolicyService } from "../services/connector-policy.js";
import { assertBoard, assertInstanceAdmin, getActorInfo, isInstanceAdminRequest } from "./authz.js";

/**
 * Instance-admin control of the managed 9Router gateway: the model each agent
 * role runs, the gateway's model list and every agent's current model. The
 * key itself stays in the server environment and is never returned.
 */
export function managedAiAdminRoutes(db: Db, options: { managedGateway?: ReturnType<typeof managedGatewayService> } = {}) {
  const router = Router();
  const managedGateway = options.managedGateway ?? managedGatewayService(db);

  // Whether SaaS mode is on for the caller. Instance-wide (no company), so the
  // UI can shape navigation before a company is chosen. Never carries the key.
  router.get("/instance/managed-ai/status", (req, res) => {
    assertBoard(req);
    res.json(managedGateway.status(isInstanceAdminRequest(req)));
  });

  router.get("/instance/settings/ai-models", async (req, res) => {
    assertInstanceAdmin(req);
    res.json(await managedGateway.adminSettings());
  });

  router.put("/instance/settings/ai-models", validate(managedAiModelPolicySchema), async (req, res) => {
    assertInstanceAdmin(req);
    const actor = getActorInfo(req);
    const result = await managedGateway.updatePolicy(req.body, actor.actorType === "user" ? actor.actorId : null);
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
      details: { policy: result.settings.policy, updatedAgents: result.updatedAgents, budgetedCompanies: result.budgetedCompanies },
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

  router.get("/instance/tenants", async (req, res) => {
    assertInstanceAdmin(req);
    res.json(await managedGateway.tenantsOverview());
  });

  router.put("/instance/tenants/:companyId/budget", validate(updateTenantBudgetSchema), async (req, res) => {
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!company) throw notFound("Company not found");
    const actor = getActorInfo(req);
    await managedGateway.setCompanyBudget(companyId, req.body.monthlyBudgetCents, actor.actorType === "user" ? actor.actorId : null);
    await logActivity(db, {
      companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId,
      action: "instance.tenant.budget_set", entityType: "company", entityId: companyId,
      details: { monthlyBudgetCents: req.body.monthlyBudgetCents },
    });
    res.json((await managedGateway.tenantsOverview()).find((row) => row.companyId === companyId) ?? null);
  });

  // Suspension pauses the company: its agents stop and nothing new runs until
  // the admin resumes it. A budget pause stays with the budget hard stop.
  async function setTenantStatus(req: Request, res: Response, status: "paused" | "active") {
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    const actor = getActorInfo(req);
    const updated = await companyService(db).update(companyId, {
      status,
      pauseReason: status === "paused" ? "manual" : null,
      pausedAt: status === "paused" ? new Date() : null,
    }, { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId ?? null, runId: actor.runId ?? null });
    if (!updated) throw notFound("Company not found");
    await logActivity(db, {
      companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId,
      action: status === "paused" ? "instance.tenant.suspended" : "instance.tenant.resumed", entityType: "company", entityId: companyId,
    });
    res.json((await managedGateway.tenantsOverview()).find((row) => row.companyId === companyId) ?? null);
  }

  router.post("/instance/tenants/:companyId/suspend", (req, res) => setTenantStatus(req, res, "paused"));
  router.post("/instance/tenants/:companyId/resume", (req, res) => setTenantStatus(req, res, "active"));

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

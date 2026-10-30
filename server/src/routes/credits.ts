import { Router } from "express";
import { z } from "zod";
import { companies, companyCreditPolicies, companyCreditCharges, instanceCreditSettings, type Db } from "@paperclipai/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { creditBalance, DEFAULT_CREDIT_ALLOWANCE, DEFAULT_CREDIT_RATES } from "../services/credit-ledger.js";
import { assertBoard, assertCompanyAccess, assertInstanceAdmin, getActorInfo } from "./authz.js";

const amount = z.number().finite().min(0).max(1_000_000).refine(value => Number.isSafeInteger(Math.round(value * 1_000_000)) && Math.abs(value * 1_000_000 - Math.round(value * 1_000_000)) < 0.00001, "At most six decimal places");
const creditSettingsSchema = z.object({ allowance: amount, input: amount, cachedInput: amount, output: amount }).strict();
const micro = (value: number) => Math.round(value * 1_000_000);
const view = (allowance: bigint, rates: { input: number; cachedInput: number; output: number }) => ({ allowance: Number(allowance) / 1_000_000, input: rates.input / 1_000_000, cachedInput: rates.cachedInput / 1_000_000, output: rates.output / 1_000_000 });
export function creditRoutes(db: Db) {
  const router = Router();
  router.get("/companies/:companyId/credits", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req); assertCompanyAccess(req, companyId);
    const balance = await creditBalance(db, companyId);
    const charges = await db.select({ amountMicrounits: companyCreditCharges.amountMicrounits, occurredAt: companyCreditCharges.occurredAt }).from(companyCreditCharges).where(eq(companyCreditCharges.companyId, companyId)).orderBy(desc(companyCreditCharges.occurredAt)).limit(20);
    res.json({ ...balance, enabled: Boolean(process.env.SOCIALAGENT_9ROUTER_API_KEY?.trim()), history: charges.map(charge => ({ amountMicrounits: charge.amountMicrounits.toString(), occurredAt: charge.occurredAt.toISOString() })) });
  });
  router.get("/instance/settings/credits", async (req, res) => {
    assertInstanceAdmin(req);
    const [settings] = await db.select().from(instanceCreditSettings).where(eq(instanceCreditSettings.singletonKey, "default"));
    res.json(view(settings?.allowanceMicrounits ?? DEFAULT_CREDIT_ALLOWANCE, settings?.rates ?? DEFAULT_CREDIT_RATES));
  });
  router.put("/instance/settings/credits", validate(creditSettingsSchema), async (req, res) => {
    assertInstanceAdmin(req);
    const actor = getActorInfo(req);
    const rates = { input: micro(req.body.input), cachedInput: micro(req.body.cachedInput), output: micro(req.body.output) };
    const allowanceMicrounits = BigInt(micro(req.body.allowance));
    await db.transaction(async tx => {
      const rows = await tx.select({ id: companies.id }).from(companies).orderBy(companies.id).for("no key update");
      await tx.insert(instanceCreditSettings).values({ singletonKey: "default", allowanceMicrounits, rates }).onConflictDoUpdate({ target: instanceCreditSettings.singletonKey, set: { allowanceMicrounits, rates, updatedAt: new Date() } });
      for (const company of rows) await logActivity(tx as unknown as Db, { companyId: company.id, actorType: actor.actorType, actorId: actor.actorId, action: "instance.settings.credits_updated", entityType: "instance_settings", entityId: "credits", details: { allowance: req.body.allowance, rates } });
    });
    res.json(view(allowanceMicrounits, rates));
  });
  router.get("/instance/companies/:companyId/credits", async (req, res) => {
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!company) throw notFound("Organization not found");
    const [override] = await db.select().from(companyCreditPolicies).where(eq(companyCreditPolicies.companyId, companyId));
    const balance = await creditBalance(db, companyId);
    res.json({ ...view(BigInt(balance.allowanceMicrounits), balance.rates), override: Boolean(override) });
  });
  router.delete("/instance/companies/:companyId/credits", async (req, res) => {
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    const actor = getActorInfo(req);
    await db.transaction(async tx => {
      const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("no key update");
      if (!company) throw notFound("Organization not found");
      await tx.delete(companyCreditPolicies).where(eq(companyCreditPolicies.companyId, companyId));
      await logActivity(tx as unknown as Db, { companyId, actorType: actor.actorType, actorId: actor.actorId, action: "company.credits_reset", entityType: "company", entityId: companyId });
    });
    res.status(204).end();
  });
  router.put("/instance/companies/:companyId/credits", validate(creditSettingsSchema), async (req, res) => {
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    const actor = getActorInfo(req);
    const rates = { input: micro(req.body.input), cachedInput: micro(req.body.cachedInput), output: micro(req.body.output) };
    const allowanceMicrounits = BigInt(micro(req.body.allowance));
    await db.transaction(async tx => {
      const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("no key update");
      if (!company) throw notFound("Organization not found");
      await tx.insert(companyCreditPolicies).values({ companyId, allowanceMicrounits, rates }).onConflictDoUpdate({ target: companyCreditPolicies.companyId, set: { allowanceMicrounits, rates, updatedAt: new Date() } });
      await logActivity(tx as unknown as Db, { companyId, actorType: actor.actorType, actorId: actor.actorId, action: "company.credits_updated", entityType: "company", entityId: companyId, details: { allowance: req.body.allowance, rates } });
    });
    res.json(view(allowanceMicrounits, rates));
  });
  return router;
}

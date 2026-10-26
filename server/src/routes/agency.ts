import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { createAgencyBrandSchema, createAgencyClientSchema, updateAgencyBrandSchema, updateAgencyClientSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { badRequest, forbidden } from "../errors.js";
import { agencyService } from "../services/agency.js";
import { isAgencyOwner } from "../services/agency-access.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function canManageAgency(req: Request, companyId: string) {
  return isAgencyOwner(req.actor, companyId);
}

export function agencyRoutes(db: Db) {
  const router = Router();
  const service = agencyService(db);
  for (const name of ["companyId", "id"]) {
    router.param(name, (_req, _res, next, value: string) => {
      if (!z.string().guid().safeParse(value).success) throw badRequest(`Invalid ${name}`);
      next();
    });
  }
  const base = "/companies/:companyId/agency";
  router.use(base, (req, _res, next) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !canManageAgency(req, companyId)) throw forbidden("Agency owner access required");
    next();
  });
  router.get("/companies/:companyId/agency", async (req, res) => {
    const companyId = req.params.companyId as string;
    res.json({ ...await service.list(companyId), canManage: canManageAgency(req, companyId) });
  });
  router.get("/companies/:companyId/agency/clients", async (req, res) => res.json((await service.list(req.params.companyId as string)).clients));
  router.get("/companies/:companyId/agency/brands", async (req, res) => res.json((await service.list(req.params.companyId as string)).brands));
  router.post("/companies/:companyId/agency/clients", validate(createAgencyClientSchema), async (req, res) => {
    res.status(201).json(await service.createClient(req.params.companyId as string, req.body, getActorInfo(req)));
  });
  router.patch("/companies/:companyId/agency/clients/:id", validate(updateAgencyClientSchema), async (req, res) => {
    res.json(await service.updateClient(req.params.companyId as string, req.params.id as string, req.body, getActorInfo(req)));
  });
  router.post("/companies/:companyId/agency/brands", validate(createAgencyBrandSchema), async (req, res) => {
    res.status(201).json(await service.createBrand(req.params.companyId as string, req.body, getActorInfo(req)));
  });
  router.patch("/companies/:companyId/agency/brands/:id", validate(updateAgencyBrandSchema), async (req, res) => {
    res.json(await service.updateBrand(req.params.companyId as string, req.params.id as string, req.body, getActorInfo(req)));
  });
  return router;
}

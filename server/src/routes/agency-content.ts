import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { contentRevisionExpectationSchema, createAgencyContentSchema, decideAgencyContentSchema, linkAgencyContentTaskSchema, listAgencyContentSchema, reviseAgencyContentSchema } from "@paperclipai/shared";
import { badRequest, forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { isAgencyOwner } from "../services/agency-access.js";
import { agencyContentService } from "../services/agency-content.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function agencyContentRoutes(db: Db) {
  const router = Router(); const service = agencyContentService(db);
  for (const param of ["companyId", "contentId"]) router.param(param, (_req, _res, next, value: string) => { if (!z.string().guid().safeParse(value).success) throw badRequest(`Invalid ${param}`); next(); });
  router.use("/companies/:companyId/content-items", (req, _res, next) => { assertCompanyAccess(req, req.params.companyId as string); next(); });
  const principal = (req: Parameters<typeof getActorInfo>[0]) => ({ actor: req.actor, audit: getActorInfo(req) });
  const owner = (req: Parameters<typeof getActorInfo>[0]) => { if (!isAgencyOwner(req.actor, req.params.companyId as string)) throw forbidden("Agency owner access required"); };
  router.get("/companies/:companyId/content-items", async (req, res) => {
    res.json(await service.list(req.params.companyId as string, principal(req), listAgencyContentSchema.parse(req.query)));
  });
  router.post("/companies/:companyId/content-items", validate(createAgencyContentSchema), async (req, res) => {
    owner(req); res.status(201).json(await service.create(req.params.companyId as string, principal(req), req.body));
  });
  router.get("/companies/:companyId/content-items/:contentId", async (req, res) => {
    res.json(await service.get(req.params.companyId as string, req.params.contentId as string, principal(req)));
  });
  router.get("/companies/:companyId/content-items/:contentId/revisions", async (req, res) => {
    const before = req.query.before === undefined ? undefined : z.coerce.number().int().min(1).parse(req.query.before);
    res.json(await service.history(req.params.companyId as string, req.params.contentId as string, principal(req), before));
  });
  router.get("/companies/:companyId/content-items/:contentId/revisions/:revisionNumber", async (req, res) => {
    const number = z.coerce.number().int().min(1).parse(req.params.revisionNumber);
    res.json(await service.getRevision(req.params.companyId as string, req.params.contentId as string, number, principal(req)));
  });
  router.post("/companies/:companyId/content-items/:contentId/revisions", validate(reviseAgencyContentSchema), async (req, res) => {
    res.status(201).json(await service.revise(req.params.companyId as string, req.params.contentId as string, principal(req), req.body));
  });
  router.post("/companies/:companyId/content-items/:contentId/submit", validate(contentRevisionExpectationSchema), async (req, res) => {
    res.json(await service.submit(req.params.companyId as string, req.params.contentId as string, principal(req), req.body.expectedRevisionNumber));
  });
  router.post("/companies/:companyId/content-items/:contentId/decisions", validate(decideAgencyContentSchema), async (req, res) => {
    owner(req); res.json(await service.decide(req.params.companyId as string, req.params.contentId as string, principal(req), req.body));
  });
  router.post("/companies/:companyId/content-items/:contentId/tasks", validate(linkAgencyContentTaskSchema), async (req, res) => {
    owner(req); res.json(await service.linkTask(req.params.companyId as string, req.params.contentId as string, principal(req), req.body));
  });
  return router;
}

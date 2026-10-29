import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { completeAgencyPublicationSchema, createAgencyPublicationSchema, listAgencyPublicationsSchema } from "@paperclipai/shared";
import { badRequest, forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { isAgencyOwner } from "../services/agency-access.js";
import { agencyPublicationsService } from "../services/agency-publications.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Content calendar. Owners schedule approved content per platform, cancel it
 * and can record the outcome; the assigned publishing agent reads its
 * publication and reports whether the post went out.
 */
export function agencyPublicationRoutes(db: Db) {
  const router = Router();
  const service = agencyPublicationsService(db);
  for (const param of ["companyId", "publicationId"]) {
    router.param(param, (_req, _res, next, value: string) => {
      if (!z.string().guid().safeParse(value).success) throw badRequest(`Invalid ${param}`);
      next();
    });
  }
  router.use("/companies/:companyId/agency/publications", (req, _res, next) => { assertCompanyAccess(req, req.params.companyId as string); next(); });
  const owner = (req: Parameters<typeof getActorInfo>[0]) => {
    if (!isAgencyOwner(req.actor, req.params.companyId as string)) throw forbidden("Agency owner access required");
  };
  const userId = (req: Parameters<typeof getActorInfo>[0]) => (req.actor.type === "board" ? req.actor.userId ?? null : null);

  router.get("/companies/:companyId/agency/publications", async (req, res) => {
    res.json(await service.list(req.params.companyId as string, listAgencyPublicationsSchema.parse(req.query)));
  });

  router.post("/companies/:companyId/agency/publications", validate(createAgencyPublicationSchema), async (req, res) => {
    owner(req);
    res.status(201).json(await service.create(req.params.companyId as string, req.body, userId(req)));
  });

  router.get("/companies/:companyId/agency/publications/:publicationId", async (req, res) => {
    res.json(await service.get(req.params.companyId as string, req.params.publicationId as string));
  });

  router.post("/companies/:companyId/agency/publications/:publicationId/cancel", async (req, res) => {
    owner(req);
    res.json(await service.cancel(req.params.companyId as string, req.params.publicationId as string, userId(req)));
  });

  router.post("/companies/:companyId/agency/publications/:publicationId/complete", validate(completeAgencyPublicationSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const publicationId = req.params.publicationId as string;
    if (req.actor.type === "agent") {
      const row = await service.getRow(companyId, publicationId);
      if (row.agentId !== req.actor.agentId) throw forbidden("Only the assigned publishing agent can report this post");
      res.json(await service.complete(companyId, publicationId, req.body, { type: "agent", id: req.actor.agentId! }));
      return;
    }
    owner(req);
    res.json(await service.complete(companyId, publicationId, req.body, { type: "user", id: getActorInfo(req).actorId }));
  });

  return router;
}

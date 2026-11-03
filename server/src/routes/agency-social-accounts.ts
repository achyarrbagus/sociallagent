import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { connectSocialAccountSchema } from "@paperclipai/shared";
import { badRequest, forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { isAgencyOwner } from "../services/agency-access.js";
import { socialAccountsService } from "../services/social-publishing/accounts.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function agencySocialAccountRoutes(db: Db) {
  const router = Router();
  const service = socialAccountsService(db);
  for (const param of ["companyId", "accountId"]) {
    router.param(param, (_req, _res, next, value: string) => {
      if (!z.string().uuid().safeParse(value).success) throw badRequest(`Invalid ${param}`);
      next();
    });
  }
  router.use("/companies/:companyId/agency/social-accounts", (req, _res, next) => {
    assertCompanyAccess(req, req.params.companyId as string);
    next();
  });
  const owner = (req: Parameters<typeof getActorInfo>[0]) => {
    if (!isAgencyOwner(req.actor, req.params.companyId as string)) throw forbidden("Agency owner access required");
  };
  const userId = (req: Parameters<typeof getActorInfo>[0]) => req.actor.type === "board" ? req.actor.userId ?? null : null;

  router.get("/companies/:companyId/agency/social-accounts", async (req, res) => {
    const brandId = req.query.brandId === undefined ? undefined : z.string().uuid().parse(req.query.brandId);
    res.json(await service.list(req.params.companyId as string, brandId));
  });
  router.post("/companies/:companyId/agency/social-accounts", validate(connectSocialAccountSchema), async (req, res) => {
    owner(req);
    res.status(201).json(await service.connect(
      req.params.companyId as string,
      req.body.brandId,
      req.body.platform,
      req.body.credentials,
      userId(req),
      getActorInfo(req),
    ));
  });
  router.delete("/companies/:companyId/agency/social-accounts/:accountId", async (req, res) => {
    owner(req);
    res.json(await service.disconnect(req.params.companyId as string, req.params.accountId as string, getActorInfo(req)));
  });
  return router;
}

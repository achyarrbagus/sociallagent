import { and, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { agencyPublications, assets, type Db } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { verifySignedSocialMediaToken } from "../services/social-publishing/public-media.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotIncludesAsset(snapshot: unknown, assetId: string, sha256: string): boolean {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.assets)) return false;
  return snapshot.assets.some(item => isRecord(item) && item.assetId === assetId && item.sha256 === sha256);
}

export function socialMediaPublicRoutes(db: Db, storage: StorageService) {
  const router = Router();

  async function serve(req: Request, res: Response) {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const claims = verifySignedSocialMediaToken(token);
    if (!claims) { res.status(404).end(); return; }

    try {
      const [publication] = await db.select({
        companyId: agencyPublications.companyId,
        dispatch: agencyPublications.dispatch,
        platform: agencyPublications.platform,
        status: agencyPublications.status,
        snapshot: agencyPublications.snapshot,
      }).from(agencyPublications).where(and(
        eq(agencyPublications.id, claims.publicationId),
        eq(agencyPublications.companyId, claims.companyId),
        eq(agencyPublications.dispatch, "connector"),
        eq(agencyPublications.platform, "instagram"),
        eq(agencyPublications.status, "publishing"),
      ));
      if (!publication || !snapshotIncludesAsset(publication.snapshot, claims.assetId, claims.sha256)) {
        res.status(404).end();
        return;
      }

      const [asset] = await db.select().from(assets).where(and(
        eq(assets.id, claims.assetId),
        eq(assets.companyId, claims.companyId),
      ));
      if (!asset || asset.sha256 !== claims.sha256 || !["image/jpeg", "video/mp4", "video/quicktime"].includes(asset.contentType)) {
        res.status(404).end();
        return;
      }

      const rawRange = req.headers.range;
      const rangeSyntax = rawRange && /^bytes=(\d*)-(\d*)$/i.exec(rawRange);
      const ranges = rawRange ? req.range(asset.byteSize) : undefined;
      if (rawRange && (!rangeSyntax || (!rangeSyntax[1] && !rangeSyntax[2]) || !Array.isArray(ranges) || ranges.length !== 1)) {
        res.setHeader("Content-Range", `bytes */${asset.byteSize}`);
        res.status(416).end();
        return;
      }
      const range = Array.isArray(ranges) ? ranges[0] : undefined;
      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("Content-Length", String(range ? range.end - range.start + 1 : asset.byteSize));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline; filename=media");
      if (range) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${asset.byteSize}`);
      }
      if (req.method === "HEAD") {
        const metadata = await storage.headObject(asset.companyId, asset.objectKey);
        if (!metadata.exists || metadata.contentLength !== asset.byteSize) { res.status(404).end(); return; }
        res.end();
        return;
      }
      const object = await storage.getObject(asset.companyId, asset.objectKey, range ? { range } : undefined);
      let settled = false;
      object.stream.on("error", () => {
        if (settled) return;
        settled = true;
        if (!res.headersSent) res.status(404).end();
        else res.destroy();
      });
      res.on("close", () => object.stream.destroy());
      object.stream.on("end", () => { settled = true; });
      object.stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  }

  router.get("/api/social-media/public-media", serve);
  return router;
}

import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { logActivity } from "../services/activity-log.js";
import {
  normalizeProjectFilePath,
  projectFileContentType,
  projectFilesService,
  PROJECT_FILES_MAX_TOTAL_BYTES,
} from "../services/project-files.js";
import type { StorageService } from "../storage/types.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Project folders for agencies: owners upload a folder of brand assets,
 * briefs or references into a project (images, videos, PDFs and documents;
 * 100 MB and 500 files per project). Board members upload and remove; anyone
 * with company access, agents included, can list and read the files.
 */
export function projectFileRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = projectFilesService(db, storage);

  async function readUpload(req: Request, res: Response) {
    const upload = multer({
      storage: multer.memoryStorage(),
      defParamCharset: "utf8",
      limits: { fileSize: PROJECT_FILES_MAX_TOTAL_BYTES, files: 1 },
    });
    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });
  }

  router.get("/companies/:companyId/projects/:projectId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.list(companyId, req.params.projectId as string));
  });

  router.post("/companies/:companyId/projects/:projectId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (req.actor.memberships?.some((m) => m.companyId === companyId && m.membershipRole === "viewer")) {
      res.status(403).json({ error: "Viewers cannot upload project files" });
      return;
    }
    try {
      await readUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        res.status(err.code === "LIMIT_FILE_SIZE" ? 422 : 400).json({
          error: err.code === "LIMIT_FILE_SIZE" ? "Project files are limited to 100 MB in total" : err.message,
        });
        return;
      }
      throw err;
    }
    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const contentType = projectFileContentType(file.mimetype, file.originalname);
    if (!contentType) {
      res.status(422).json({ error: "Only images, videos, PDFs and documents can be uploaded" });
      return;
    }
    const actor = getActorInfo(req);
    const saved = await svc.add({
      companyId,
      projectId,
      path: normalizeProjectFilePath((req.body as Record<string, unknown> | undefined)?.path, file.originalname),
      filename: file.originalname,
      contentType,
      body: file.buffer,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "project.file_uploaded",
      entityType: "project",
      entityId: projectId,
      details: { fileId: saved.id, path: saved.path, byteSize: saved.byteSize },
    });
    res.status(201).json({ ...saved, contentPath: `/api/assets/${saved.assetId}/content` });
  });

  router.delete("/companies/:companyId/projects/:projectId/files/:fileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const projectId = req.params.projectId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (req.actor.memberships?.some((m) => m.companyId === companyId && m.membershipRole === "viewer")) {
      res.status(403).json({ error: "Viewers cannot remove project files" });
      return;
    }
    const removed = await svc.remove(companyId, projectId, req.params.fileId as string);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "project.file_removed",
      entityType: "project",
      entityId: projectId,
      details: { fileId: removed.id, path: removed.relativePath },
    });
    res.json({ ok: true });
  });

  return router;
}

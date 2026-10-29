import { and, asc, eq, sql } from "drizzle-orm";
import { assets, projectFiles, projects, type Db } from "@paperclipai/db";
import { conflict, notFound, unprocessable } from "../errors.js";
import type { StorageService } from "../storage/types.js";

/** Per-project limits for uploaded folders. */
export const PROJECT_FILES_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const PROJECT_FILES_MAX_COUNT = 500;

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/rtf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", rtf: "application/rtf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  heic: "image/heic", avif: "image/avif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
};

/**
 * Images, videos, PDFs and office/text documents only. Browsers often send a
 * generic type for documents, so the extension decides when the type does not.
 */
export function projectFileContentType(contentType: string | undefined, filename: string): string | null {
  const type = (contentType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (type.startsWith("image/") || type.startsWith("video/") || DOCUMENT_TYPES.has(type)) return type;
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

/** A relative path inside the uploaded folder: no absolute paths, no `..`, at most 512 characters. */
export function normalizeProjectFilePath(input: unknown, fallbackName: string): string {
  const raw = (typeof input === "string" && input.trim() ? input : fallbackName).replaceAll("\\", "/");
  const parts = raw.split("/").map((part) => part.trim()).filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) throw unprocessable("Invalid file path");
  const path = parts.join("/");
  if (path.length > 512) throw unprocessable("File path is too long");
  return path;
}

export function projectFilesService(db: Db, storage: StorageService) {
  async function assertProject(companyId: string, projectId: string) {
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
    if (!project) throw notFound("Project not found");
  }

  async function list(companyId: string, projectId: string) {
    await assertProject(companyId, projectId);
    const rows = await db
      .select({ file: projectFiles, asset: assets })
      .from(projectFiles)
      .innerJoin(assets, eq(assets.id, projectFiles.assetId))
      .where(and(eq(projectFiles.companyId, companyId), eq(projectFiles.projectId, projectId)))
      .orderBy(asc(projectFiles.relativePath));
    const files = rows.map(({ file, asset }) => ({
      id: file.id,
      projectId: file.projectId,
      assetId: asset.id,
      path: file.relativePath,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      contentPath: `/api/assets/${asset.id}/content`,
      createdAt: file.createdAt,
    }));
    return {
      files,
      totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0),
      limits: { maxTotalBytes: PROJECT_FILES_MAX_TOTAL_BYTES, maxFiles: PROJECT_FILES_MAX_COUNT },
    };
  }

  /**
   * Stores one file of an uploaded folder. The project lock makes the limit
   * check and the insert one step, so parallel uploads cannot overshoot.
   */
  async function add(input: {
    companyId: string;
    projectId: string;
    path: string;
    filename: string;
    contentType: string;
    body: Buffer;
    userId: string | null;
  }) {
    await assertProject(input.companyId, input.projectId);
    if (input.body.length === 0) throw unprocessable("File is empty");
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`socialagent:project-files:${input.projectId}`}, 0))`);
      const [usage] = await tx
        .select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${assets.byteSize}), 0)::bigint` })
        .from(projectFiles)
        .innerJoin(assets, eq(assets.id, projectFiles.assetId))
        .where(eq(projectFiles.projectId, input.projectId));
      const [existing] = await tx.select({ id: projectFiles.id }).from(projectFiles)
        .where(and(eq(projectFiles.projectId, input.projectId), eq(projectFiles.relativePath, input.path)));
      if (existing) throw conflict(`A file named ${input.path} is already in this project`);
      if ((usage?.count ?? 0) >= PROJECT_FILES_MAX_COUNT) throw unprocessable(`A project can hold at most ${PROJECT_FILES_MAX_COUNT} files`);
      if (Number(usage?.bytes ?? 0) + input.body.length > PROJECT_FILES_MAX_TOTAL_BYTES) {
        throw unprocessable("Project files are limited to 100 MB in total");
      }
      const stored = await storage.putFile({
        companyId: input.companyId,
        namespace: `projects/${input.projectId}`,
        originalFilename: input.filename,
        contentType: input.contentType,
        body: input.body,
      });
      const [asset] = await tx.insert(assets).values({
        ...stored,
        companyId: input.companyId,
        createdByUserId: input.userId,
      }).returning();
      const [file] = await tx.insert(projectFiles).values({
        companyId: input.companyId,
        projectId: input.projectId,
        assetId: asset!.id,
        relativePath: input.path,
        createdByUserId: input.userId,
      }).returning();
      return { id: file!.id, path: file!.relativePath, assetId: asset!.id, byteSize: asset!.byteSize, contentType: asset!.contentType };
    });
  }

  async function remove(companyId: string, projectId: string, fileId: string) {
    const [file] = await db.select().from(projectFiles)
      .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId), eq(projectFiles.companyId, companyId)));
    if (!file) throw notFound("File not found");
    const [asset] = await db.select().from(assets).where(eq(assets.id, file.assetId));
    await db.delete(assets).where(eq(assets.id, file.assetId));
    if (asset) await storage.deleteObject(companyId, asset.objectKey).catch(() => undefined);
    return file;
  }

  return { list, add, remove };
}

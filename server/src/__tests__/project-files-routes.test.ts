import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { projects } from "@paperclipai/db";
import { projectFileRoutes } from "../routes/project-files.js";
import { issueRoutes } from "../routes/issues.js";
import { normalizeProjectFilePath, projectFileContentType, PROJECT_FILES_MAX_COUNT } from "../services/project-files.js";
import type { StorageService } from "../storage/types.js";
import {
  describeEmbeddedPostgres,
  routeApp,
  seedCompanyWithBoardAccess,
  type BoardActor,
  useEmbeddedPostgres,
} from "./helpers/route-test-harness.js";

function memoryStorage(): StorageService & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    provider: "local_disk",
    async putFile(input) {
      const objectKey = `${input.companyId}/${input.namespace}/${randomUUID()}`;
      objects.set(objectKey, input.body);
      return {
        provider: "local_disk",
        objectKey,
        contentType: input.contentType,
        byteSize: input.body.length,
        sha256: createHash("sha256").update(input.body).digest("hex"),
        originalFilename: input.originalFilename ?? null,
      };
    },
    async getObject() { throw new Error("not used"); },
    async headObject() { throw new Error("not used"); },
    async deleteObject(_companyId, objectKey) { objects.delete(objectKey); },
  } as StorageService & { objects: Map<string, Buffer> };
}

it("accepts images, videos, PDFs and documents only", () => {
  expect(projectFileContentType("image/png", "logo.png")).toBe("image/png");
  expect(projectFileContentType("video/mp4", "ad.mp4")).toBe("video/mp4");
  expect(projectFileContentType("application/octet-stream", "brief.docx")).toContain("wordprocessingml");
  expect(projectFileContentType("application/pdf", "guide.pdf")).toBe("application/pdf");
  expect(projectFileContentType("application/x-sh", "run.sh")).toBeNull();
  expect(projectFileContentType("application/octet-stream", "tool.exe")).toBeNull();
});

it("keeps folder paths relative", () => {
  expect(normalizeProjectFilePath("Brand/Logos/./logo.png", "logo.png")).toBe("Brand/Logos/logo.png");
  expect(normalizeProjectFilePath("", "logo.png")).toBe("logo.png");
  expect(() => normalizeProjectFilePath("../secret.pdf", "x")).toThrow();
});

describeEmbeddedPostgres("project files", () => {
  const ctx = useEmbeddedPostgres("project-files-routes");

  async function seed() {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Project files");
    const [project] = await ctx.db.insert(projects).values({ companyId: seeded.companyId, name: "Launch" }).returning();
    const storage = memoryStorage();
    return { ...seeded, project: project!, storage, app: routeApp(ctx.db, seeded.actor, (db) => projectFileRoutes(db, storage)) };
  }

  it("uploads a folder, lists it, rejects duplicates and unsupported files, and removes a file", async () => {
    const { companyId, project, storage, app } = await seed();
    const base = `/api/companies/${companyId}/projects/${project.id}/files`;

    const logo = await request(app).post(base).field("path", "Brand/logo.png").attach("file", Buffer.from("png-bytes"), { filename: "logo.png", contentType: "image/png" });
    expect(logo.status, JSON.stringify(logo.body)).toBe(201);
    const brief = await request(app).post(base).field("path", "Brand/brief.pdf").attach("file", Buffer.from("%PDF"), { filename: "brief.pdf", contentType: "application/pdf" });
    expect(brief.status).toBe(201);

    expect((await request(app).post(base).field("path", "Brand/logo.png").attach("file", Buffer.from("again"), { filename: "logo.png", contentType: "image/png" })).status).toBe(409);
    expect((await request(app).post(base).field("path", "run.sh").attach("file", Buffer.from("#!"), { filename: "run.sh", contentType: "application/x-sh" })).status).toBe(422);

    const listed = await request(app).get(base);
    expect(listed.body.files.map((file: { path: string }) => file.path)).toEqual(["Brand/brief.pdf", "Brand/logo.png"]);
    expect(listed.body.totalBytes).toBe(13);
    expect(listed.body.limits).toEqual({ maxTotalBytes: 100 * 1024 * 1024, maxFiles: PROJECT_FILES_MAX_COUNT });

    expect((await request(app).delete(`${base}/${logo.body.id}`)).status).toBe(200);
    expect((await request(app).get(base)).body.files).toHaveLength(1);
    expect(storage.objects.size).toBe(1);
  });

  it("refuses another company's project and viewers", async () => {
    const { companyId, project, storage } = await seed();
    const other = await seed();
    const otherApp = routeApp(ctx.db, other.actor, (db) => projectFileRoutes(db, storage));
    expect((await request(otherApp).get(`/api/companies/${companyId}/projects/${project.id}/files`)).status).toBe(403);
    // Someone with access to their own company cannot reach a project from another one through it.
    expect((await request(otherApp).get(`/api/companies/${other.companyId}/projects/${project.id}/files`)).status).toBe(404);

    const viewer: BoardActor = { ...other.actor, companyIds: [companyId], memberships: [{ companyId, membershipRole: "viewer", status: "active" }] };
    const viewerApp = routeApp(ctx.db, viewer, (db) => projectFileRoutes(db, storage));
    const upload = await request(viewerApp).post(`/api/companies/${companyId}/projects/${project.id}/files`).attach("file", Buffer.from("x"), { filename: "a.png", contentType: "image/png" });
    expect(upload.status).toBe(403);
    const [stillThere] = await ctx.db.select().from(projects).where(eq(projects.id, project.id));
    expect(stillThere).toBeTruthy();
  });

  it("lists the project's files in the agent-facing heartbeat context", async () => {
    const { companyId, project, storage, actor, app } = await seed();
    await request(app).post(`/api/companies/${companyId}/projects/${project.id}/files`)
      .field("path", "Brand/guide.pdf").attach("file", Buffer.from("%PDF-1"), { filename: "guide.pdf", contentType: "application/pdf" });
    const issuesApp = routeApp(ctx.db, actor, (db) => issueRoutes(db, storage));
    const created = await request(issuesApp).post(`/api/companies/${companyId}/issues`).send({ title: "Write launch copy", projectId: project.id });
    expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);

    const context = await request(issuesApp).get(`/api/issues/${created.body.id}/heartbeat-context`);
    expect(context.status, JSON.stringify(context.body)).toBe(200);
    expect(context.body.project.files).toEqual([expect.objectContaining({
      path: "Brand/guide.pdf", contentType: "application/pdf", byteSize: 6, contentPath: expect.stringMatching(/^\/api\/assets\/.+\/content$/),
    })]);
  });
});

import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { socialMediaPublicRoutes } from "./social-media-public.js";
import { createDispatchSocialMediaUrl } from "../services/social-publishing/public-media.js";
import type { StorageService } from "../storage/types.js";

const checksum = "b".repeat(64);

afterEach(() => vi.unstubAllEnvs());

function fixture(snapshotChecksum = checksum) {
  vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "b".repeat(64));
  const companyId = randomUUID();
  const publicationId = randomUUID();
  const assetId = randomUUID();
  const results = [
    [{ companyId, dispatch: "connector", platform: "instagram", status: "publishing", snapshot: { assets: [{ assetId, sha256: snapshotChecksum }] } }],
    [{ id: assetId, companyId, objectKey: "assets/test.jpg", contentType: "image/jpeg", byteSize: 11, sha256: checksum }],
  ];
  const db = {
    select: () => ({ from: () => ({ where: async () => results.shift() ?? [] }) }),
  };
  const storage = {
    provider: "local_disk",
    getObject: vi.fn(async () => ({ stream: Readable.from([Buffer.from("photo bytes")]), contentType: "image/jpeg", contentLength: 11 })),
    headObject: vi.fn(),
  } as unknown as StorageService;
  const app = express();
  app.use(socialMediaPublicRoutes(db as never, storage));
  const url = createDispatchSocialMediaUrl({ companyId, publicationId, assetId, sha256: checksum, publicBaseUrl: "https://social.example" })!;
  return { app, url, storage, db };
}

describe("public signed Instagram media route", () => {
  it("serves only an approved asset referenced by an active Instagram publication", async () => {
    const f = fixture();
    const response = await request(f.app).get(new URL(f.url).pathname + new URL(f.url).search);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(response.body).toString("utf8")).toBe("photo bytes");
    expect(f.storage.getObject).toHaveBeenCalledOnce();
  });

  it("fails closed when the publication snapshot does not contain the signed asset hash", async () => {
    const f = fixture("c".repeat(64));
    const response = await request(f.app).get(new URL(f.url).pathname + new URL(f.url).search);
    expect(response.status).toBe(404);
    expect(f.storage.getObject).not.toHaveBeenCalled();
  });

  it("does not query storage for expired or tampered capabilities", async () => {
    const f = fixture();
    const parsed = new URL(f.url);
    parsed.searchParams.set("token", `${parsed.searchParams.get("token")!.slice(0, -1)}x`);
    const response = await request(f.app).get(parsed.pathname + parsed.search);
    expect(response.status).toBe(404);
    expect(f.storage.getObject).not.toHaveBeenCalled();
  });
});

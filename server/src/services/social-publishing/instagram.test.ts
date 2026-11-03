import { describe, expect, it, vi } from "vitest";
import { instagramAdapter } from "./instagram.js";
import type { PublishContext, PublishMedia } from "./types.js";

const credentials = { instagramAccountId: "17841400000000000", accessToken: "opaque-instagram-token" };
const signedUrl = "https://social.example/api/social-media/public-media?token=capability-secret";

function media(assetId: string, kind: "image" | "video", contentType = kind === "image" ? "image/jpeg" : "video/mp4"): PublishMedia {
  return { assetId, kind, contentType, byteSize: 512, filename: `${assetId}.${kind === "image" ? "jpg" : "mp4"}`, read: async () => Buffer.from("media"), signedUrl };
}

function context(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    text: "Approved Instagram caption",
    shape: "photo",
    media: [media("asset-image", "image")],
    credentials,
    checkpoint: {},
    saveCheckpoint: vi.fn(async () => undefined),
    fetch: vi.fn(),
    ...overrides,
  };
}

function readyStatus() {
  return Response.json({ id: "container-1", status_code: "FINISHED", status: "Finished" });
}

describe("Instagram publishing adapter", () => {
  it("verifies a professional account using the supplied Instagram Login token", async () => {
    const suppliedCredentials = { accessToken: credentials.accessToken };
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://graph.instagram.com/v26.0/me?fields=user_id,username");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${credentials.accessToken}`);
      expect(String(input)).not.toContain(credentials.accessToken);
      return Response.json({ user_id: credentials.instagramAccountId, username: "coffee_creator" });
    });
    await expect(instagramAdapter.verify(suppliedCredentials, fetchImpl)).resolves.toEqual({
      externalAccountId: credentials.instagramAccountId,
      displayName: "@coffee_creator",
      tokenExpiresAt: null,
      credentials: { ...suppliedCredentials, instagramAccountId: credentials.instagramAccountId },
    });
  });

  it("publishes one JPEG after its container is ready and returns Instagram's permalink", async () => {
    const events: string[] = [];
    const saveCheckpoint = vi.fn(async (value: Record<string, unknown>) => { if (value.finalSent) events.push("checkpoint"); });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media")) {
        const body = init?.body as URLSearchParams;
        expect(body.get("image_url")).toBe(signedUrl);
        expect(body.get("caption")).toBe("Approved Instagram caption");
        events.push("container");
        return Response.json({ id: "container-1" });
      }
      if (url.endsWith("/container-1?fields=status_code,status")) return readyStatus();
      if (url.endsWith("/media_publish")) {
        expect((init?.body as URLSearchParams).get("creation_id")).toBe("container-1");
        events.push("publish");
        return Response.json({ id: "media-1" });
      }
      expect(url).toBe("https://graph.instagram.com/v26.0/media-1?fields=permalink");
      return Response.json({ permalink: "https://www.instagram.com/p/shortcode/" });
    });
    await expect(instagramAdapter.publish(context({ fetch: fetchImpl, saveCheckpoint }))).resolves.toEqual({
      status: "published",
      providerPostId: "media-1",
      externalUrl: "https://www.instagram.com/p/shortcode/",
    });
    expect(events).toEqual(["container", "checkpoint", "publish"]);
    expect(saveCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({ instagramContainerId: "container-1", finalSent: true }));
  });

  it("publishes a mixed carousel only after every child and parent is ready", async () => {
    const sequence: string[] = [];
    const items = [media("image-1", "image"), media("video-2", "video")];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media")) {
        const body = init?.body as URLSearchParams;
        if (body.get("is_carousel_item") === "true") {
          sequence.push(body.get("image_url") ? "image-child" : "video-child");
          return Response.json({ id: `child-${sequence.length}` });
        }
        expect(body.get("media_type")).toBe("CAROUSEL");
        expect(body.get("children")).toBe("child-1,child-2");
        sequence.push("carousel-parent");
        return Response.json({ id: "carousel-1" });
      }
      if (url.includes("?fields=status_code,status")) {
        sequence.push(url.includes("carousel-1") ? "parent-ready" : "child-ready");
        return Response.json({ status_code: "FINISHED" });
      }
      if (url.endsWith("/media_publish")) { sequence.push("publish"); return Response.json({ id: "media-carousel" }); }
      return Response.json({ permalink: "https://www.instagram.com/p/carousel/" });
    });
    const result = await instagramAdapter.publish(context({ shape: "carousel", media: items, fetch: fetchImpl }));
    expect(result).toMatchObject({ status: "published", providerPostId: "media-carousel" });
    expect(sequence).toEqual(["image-child", "video-child", "child-ready", "child-ready", "carousel-parent", "parent-ready", "publish"]);
  });

  it("publishes a video as a Reel", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media")) {
        const body = init?.body as URLSearchParams;
        expect(body.get("media_type")).toBe("REELS");
        expect(body.get("video_url")).toBe(signedUrl);
        return Response.json({ id: "reel-container" });
      }
      if (url.endsWith("/reel-container?fields=status_code,status")) return Response.json({ status_code: "FINISHED" });
      if (url.endsWith("/media_publish")) return Response.json({ id: "reel-media" });
      return Response.json({ permalink: "https://www.instagram.com/reel/reel-code/" });
    });
    await expect(instagramAdapter.publish(context({ shape: "video", media: [media("video-1", "video")], fetch: fetchImpl }))).resolves.toMatchObject({
      status: "published", providerPostId: "reel-media", externalUrl: "https://www.instagram.com/reel/reel-code/",
    });
  });

  it("resumes from a saved container and will not repeat the final publish", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/saved-container?fields=status_code,status")) return readyStatus();
      if (url.endsWith("/media_publish")) return Response.json({ id: "resumed-media" });
      return Response.json({ permalink: "https://www.instagram.com/p/resumed/" });
    });
    await expect(instagramAdapter.publish(context({ checkpoint: { instagramContainerId: "saved-container" }, fetch: fetchImpl }))).resolves.toMatchObject({ status: "published", providerPostId: "resumed-media" });
    await expect(instagramAdapter.publish(context({ checkpoint: { finalSent: true }, fetch: fetchImpl }))).resolves.toMatchObject({ status: "unknown" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects text-only posts and missing public media URLs without contacting Instagram", async () => {
    const fetchImpl = vi.fn();
    await expect(instagramAdapter.publish(context({ shape: "text", media: [], fetch: fetchImpl }))).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("requires one photo") });
    await expect(instagramAdapter.publish(context({ media: [{ ...media("image-1", "image"), signedUrl: null }], fetch: fetchImpl }))).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("publicly reachable HTTPS") });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not leak tokens or signed media capabilities in provider errors", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: `Access token ${credentials.accessToken} cannot fetch ${signedUrl}` } }, { status: 400 }));
    const result = await instagramAdapter.publish(context({ fetch: fetchImpl }));
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain(credentials.accessToken);
    expect(JSON.stringify(result)).not.toContain("capability-secret");
  });
});

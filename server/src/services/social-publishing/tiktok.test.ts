import { describe, expect, it, vi } from "vitest";
import { tiktokAdapter } from "./tiktok.js";
import type { PublishContext } from "./types.js";

const credentials = {
  clientKey: "client-key-1",
  clientSecret: "opaque-client-secret-123",
  refreshToken: "opaque-refresh-token-123",
  accessToken: "opaque-access-token-123",
  openId: "creator-open-id",
  creatorUsername: "coffee_creator",
  scope: "video.publish",
  refreshTokenExpiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
};

function context(overrides: Partial<PublishContext> = {}): PublishContext {
  const video = {
    assetId: "asset-video",
    kind: "video" as const,
    contentType: "video/mp4",
    byteSize: 3,
    filename: "approved.mp4",
    read: async () => Buffer.from([1, 2, 3]),
    signedUrl: null,
  };
  return {
    text: "Approved video caption",
    shape: "video",
    media: [video],
    credentials,
    checkpoint: {},
    saveCheckpoint: vi.fn(async () => undefined),
    withFreshCredentials: async () => credentials,
    fetch: vi.fn(),
    ...overrides,
  };
}

function creatorInfoResponse() {
  return Response.json({ data: { creator_username: "coffee_creator", creator_nickname: "Coffee Creator", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok", message: "" } });
}

describe("TikTok Content Posting adapter", () => {
  it("refreshes the supplied token, rotates the refresh token, and verifies creator identity", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/oauth/token/")) {
        expect(new Headers(init?.headers).get("content-type")).toContain("application/x-www-form-urlencoded");
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        expect(String(init?.body)).toContain("client_key=client-key-1");
        expect(String(init?.body)).toContain("refresh_token=opaque-refresh-token-123");
        return Response.json({ access_token: "new-access", refresh_token: "new-refresh", open_id: "creator-open-id", scope: "video.publish", expires_in: 7200, refresh_expires_in: 15_552_000 });
      }
      expect(String(input)).toBe("https://open.tiktokapis.com/v2/post/publish/creator_info/query/");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer new-access");
      return creatorInfoResponse();
    });
    const result = await tiktokAdapter.verify({ clientKey: "client-key-1", clientSecret: credentials.clientSecret, refreshToken: credentials.refreshToken }, fetchImpl);
    expect(result.externalAccountId).toBe("creator-open-id");
    expect(result.displayName).toBe("Coffee Creator");
    expect(result.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(result.credentials).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", creatorUsername: "coffee_creator" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uploads an approved video, forces private visibility, and records TikTok's completed post id", async () => {
    const events: string[] = [];
    const saveCheckpoint = vi.fn(async (value: Record<string, unknown>) => {
      if (value.finalSent) events.push("checkpoint");
    });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/creator_info/query/")) return creatorInfoResponse();
      if (url.endsWith("/video/init/")) {
        const body = JSON.parse(String(init?.body));
        expect(body.post_info).toEqual({ title: "Approved video caption", privacy_level: "SELF_ONLY" });
        expect(body.source_info).toMatchObject({ source: "FILE_UPLOAD", video_size: 3, total_chunk_count: 1 });
        events.push("init");
        return Response.json({ data: { publish_id: "pub-42", upload_url: "https://open-upload.tiktokapis.com/video/?upload_token=secret" }, error: { code: "ok" } });
      }
      if (url.startsWith("https://open-upload.tiktokapis.com/")) {
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("authorization")).toBeNull();
        expect(new Headers(init?.headers).get("content-range")).toBe("bytes 0-2/3");
        events.push("upload");
        return new Response(null, { status: 201 });
      }
      expect(url.endsWith("/status/fetch/")).toBe(true);
      expect(JSON.parse(String(init?.body))).toEqual({ publish_id: "pub-42" });
      events.push("status");
      return Response.json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["post-99"] }, error: { code: "ok" } });
    });
    await expect(tiktokAdapter.publish(context({ fetch: fetchImpl, saveCheckpoint }))).resolves.toEqual({
      status: "published",
      providerPostId: "post-99",
      externalUrl: "https://www.tiktok.com/@coffee_creator/video/post-99",
    });
    expect(events).toEqual(["init", "checkpoint", "upload", "checkpoint", "status"]);
    expect(saveCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ publishId: "pub-42", finalSent: true }));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not claim publishing completed while TikTok is still processing", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/creator_info/query/")) return creatorInfoResponse();
      if (String(input).endsWith("/video/init/")) return Response.json({ data: { publish_id: "pub-pending", upload_url: "https://open-upload.tiktokapis.com/video/?upload_token=secret" }, error: { code: "ok" } });
      if (String(input).startsWith("https://open-upload.tiktokapis.com/")) return new Response(null, { status: 201 });
      return Response.json({ data: { status: "PROCESSING_UPLOAD", publicaly_available_post_id: [] }, error: { code: "ok" } });
    });
    await expect(tiktokAdapter.publish(context({ fetch: fetchImpl }))).resolves.toMatchObject({ status: "unknown", reason: expect.stringContaining("pub-pending") });
  });

  it("rejects unsupported post shapes and avoids replaying a checkpointed post", async () => {
    const fetchImpl = vi.fn();
    await expect(tiktokAdapter.publish(context({ shape: "text", media: [], fetch: fetchImpl }))).resolves.toMatchObject({ status: "failed", reason: expect.stringContaining("one video") });
    await expect(tiktokAdapter.publish(context({ checkpoint: { finalSent: true }, fetch: fetchImpl }))).resolves.toMatchObject({ status: "unknown" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose provider secrets in refresh errors", async () => {
    const lost = vi.fn(async () => { throw new Error("socket closed"); });
    const result = await tiktokAdapter.publish(context({ withFreshCredentials: async refresh => { await refresh(credentials); return credentials; }, fetch: lost }));
    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain(credentials.clientSecret);
    expect(JSON.stringify(result)).not.toContain(credentials.refreshToken);
  });
});

import { describe, expect, it, vi } from "vitest";
import { linkedinAdapter } from "./linkedin.js";
import type { PublishContext } from "./types.js";

const credentials = { accessToken: "opaque-linkedin-token-123", authorUrn: "urn:li:person:person-123" };
function context(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    text: "A literal #post",
    shape: "text",
    media: [],
    credentials,
    checkpoint: {},
    saveCheckpoint: vi.fn(async () => undefined),
    fetch: vi.fn(),
    ...overrides,
  };
}

describe("LinkedIn member adapter", () => {
  it("verifies a member and checks the supplied author URN", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://api.linkedin.com/v2/userinfo");
      return Response.json({ sub: "person-123", name: "LinkedIn Member" });
    });
    await expect(linkedinAdapter.verify(credentials, fetchImpl)).resolves.toEqual({ externalAccountId: "person-123", displayName: "LinkedIn Member", tokenExpiresAt: null });
    await expect(linkedinAdapter.verify({ ...credentials, authorUrn: "urn:li:person:other" }, fetchImpl)).rejects.toThrow("did not confirm");
  });

  it("posts member text with required version headers and records the final-send checkpoint first", async () => {
    const events: string[] = [];
    const saveCheckpoint = vi.fn(async (value: Record<string, unknown>) => { if (value.finalSent) events.push("checkpoint"); });
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("linkedin-version")).toBe("202608");
      expect(headers.get("x-restli-protocol-version")).toBe("2.0.0");
      expect(JSON.parse(String(init?.body))).toMatchObject({ author: credentials.authorUrn, commentary: "A literal #post", lifecycleState: "PUBLISHED" });
      events.push("post");
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:555" } });
    });
    await expect(linkedinAdapter.publish(context({ fetch: fetchImpl, saveCheckpoint }))).resolves.toEqual({
      status: "published", providerPostId: "urn:li:share:555", externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:555",
    });
    expect(events).toEqual(["checkpoint", "post"]);
  });

  it("initializes and uploads an image before creating a post", async () => {
    const media = { assetId: "asset", kind: "image" as const, contentType: "image/jpeg", byteSize: 3, filename: "x.jpg", read: async () => Buffer.from([1, 2, 3]), signedUrl: null };
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/images?action=initializeUpload")) {
        expect(JSON.parse(String(init?.body))).toEqual({ initializeUploadRequest: { owner: credentials.authorUrn } });
        return Response.json({ value: { uploadUrl: "https://www.linkedin.com/upload/secret", image: "urn:li:image:asset-1" } });
      }
      if (String(input).includes("/upload/secret")) {
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("authorization")).toBeNull();
        return new Response(null, { status: 201 });
      }
      expect(JSON.parse(String(init?.body))).toMatchObject({ content: { media: { id: "urn:li:image:asset-1" } } });
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:photo-1" } });
    });
    await expect(linkedinAdapter.publish(context({ shape: "photo", media: [media], fetch: fetchImpl }))).resolves.toMatchObject({ status: "published", providerPostId: "urn:li:share:photo-1" });
  });

  it("redacts token errors and classifies lost post responses as unknown", async () => {
    const rejected = vi.fn(async () => Response.json({ message: `bad ${credentials.accessToken}` }, { status: 400 }));
    await expect(linkedinAdapter.publish(context({ fetch: rejected }))).resolves.toEqual({ status: "failed", reason: "LinkedIn refused the request: bad [redacted]" });
    const lost = vi.fn(async () => { throw new Error("socket closed"); });
    await expect(linkedinAdapter.publish(context({ fetch: lost }))).resolves.toMatchObject({ status: "unknown" });
  });
});

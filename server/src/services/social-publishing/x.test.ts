import { describe, expect, it, vi } from "vitest";
import { xAdapter, xWeightedLength } from "./x.js";
import type { PublishContext } from "./types.js";

const accessToken = "opaque-x-user-token-123";
function context(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    text: "Hello X",
    shape: "text",
    media: [],
    credentials: { accessToken },
    checkpoint: {},
    saveCheckpoint: vi.fn(async () => undefined),
    fetch: vi.fn(),
    ...overrides,
  };
}

describe("X adapter", () => {
  it("counts URLs as 23 and non-BMP emoji as two weighted characters", () => {
    expect(xWeightedLength(`A https://example.com ${"😀"}`)).toBe(1 + 1 + 23 + 1 + 2);
  });

  it("verifies the authenticated user and renders the handle", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.x.com/2/users/me?user.fields=name,username");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
      return Response.json({ data: { id: "123", name: "X User", username: "xuser" } });
    });
    await expect(xAdapter.verify({ accessToken }, fetchImpl)).resolves.toEqual({ externalAccountId: "123", displayName: "@xuser", tokenExpiresAt: null });
  });

  it("publishes text and saves the no-duplicate checkpoint before dispatch", async () => {
    const events: string[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ text: "Hello X" });
      events.push("post");
      return Response.json({ data: { id: "98765" } });
    });
    const saveCheckpoint = vi.fn(async (value: Record<string, unknown>) => { if (value.finalSent) events.push("checkpoint"); });
    await expect(xAdapter.publish(context({ fetch: fetchImpl, saveCheckpoint }))).resolves.toEqual({
      status: "published", providerPostId: "98765", externalUrl: "https://x.com/i/status/98765",
    });
    expect(events).toEqual(["checkpoint", "post"]);
  });

  it("uploads a photo and posts its media id", async () => {
    const media = { assetId: "asset", kind: "image" as const, contentType: "image/png", byteSize: 3, filename: "a.png", read: async () => Buffer.from([1, 2, 3]), signedUrl: null };
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/media/upload")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ media: "AQID", media_category: "tweet_image" });
        return Response.json({ data: { id: "media-1" } });
      }
      expect(JSON.parse(String(init?.body))).toEqual({ text: "Hello X", media: { media_ids: ["media-1"] } });
      return Response.json({ data: { id: "post-1" } });
    });
    await expect(xAdapter.publish(context({ shape: "photo", media: [media], fetch: fetchImpl }))).resolves.toMatchObject({ status: "published", providerPostId: "post-1" });
  });

  it("redacts tokens and treats an ambiguous transport result as unknown", async () => {
    const rejected = vi.fn(async () => Response.json({ detail: `bad ${accessToken}` }, { status: 400 }));
    await expect(xAdapter.publish(context({ fetch: rejected }))).resolves.toEqual({ status: "failed", reason: "X refused the request: bad [redacted]" });
    const lost = vi.fn(async () => { throw new Error("socket closed"); });
    await expect(xAdapter.publish(context({ fetch: lost }))).resolves.toMatchObject({ status: "unknown" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { facebookPageAdapter } from "./facebook.js";
import type { PublishContext } from "./types.js";

const credentials = { pageId: "123456789012345", pageAccessToken: "opaque-page-token-value" };

function context(overrides: Partial<PublishContext> = {}): PublishContext {
  return {
    text: "Approved caption",
    shape: "text",
    media: [],
    credentials,
    checkpoint: {},
    saveCheckpoint: vi.fn(async () => undefined),
    fetch: vi.fn(),
    ...overrides,
  };
}

describe("Facebook Pages adapter", () => {
  it("verifies a Page identity without putting its token in the URL", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://graph.facebook.com/v22.0/123456789012345?fields=id,name");
      return Response.json({ id: credentials.pageId, name: "Coffee Page" });
    });
    await expect(facebookPageAdapter.verify(credentials, fetchImpl)).resolves.toEqual({
      externalAccountId: credentials.pageId,
      displayName: "Coffee Page",
      tokenExpiresAt: null,
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: `Bearer ${credentials.pageAccessToken}` });
  });

  it("redacts provider credential text when verification fails", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: `Invalid token ${credentials.pageAccessToken}` } }, { status: 401 }));
    await expect(facebookPageAdapter.verify(credentials, fetchImpl)).rejects.toThrow("Invalid token [redacted]");
  });

  it("posts text as form data and returns the confirmed post id", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://graph.facebook.com/v22.0/123456789012345/feed");
      expect(init?.headers).toMatchObject({ authorization: `Bearer ${credentials.pageAccessToken}` });
      expect(String(input)).not.toContain(credentials.pageAccessToken);
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      expect((init?.body as URLSearchParams).get("message")).toBe("Approved caption");
      return Response.json({ id: "123456789012345_987654321" });
    });
    await expect(facebookPageAdapter.publish(context({ fetch: fetchImpl }))).resolves.toEqual({
      status: "published",
      providerPostId: "123456789012345_987654321",
      externalUrl: "https://www.facebook.com/123456789012345_987654321",
    });
  });

  it("classifies a lost provider response as unknown rather than retryable failure", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error(`connection lost with ${credentials.pageAccessToken}`); });
    await expect(facebookPageAdapter.publish(context({ fetch: fetchImpl }))).resolves.toEqual({
      status: "unknown",
      reason: "Facebook may have accepted the post, but its response was not received. Verify the Page before retrying.",
    });
  });

  it("does not label an accepted response without a post id as a safe failure", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    await expect(facebookPageAdapter.publish(context({ fetch: fetchImpl }))).resolves.toEqual({
      status: "unknown",
      reason: "Facebook accepted the request but returned no post identifier. Verify the Page before retrying.",
    });
  });

  it("uploads one approved image directly and rejects unsupported media shapes", async () => {
    const media = {
      assetId: "asset",
      kind: "image" as const,
      contentType: "image/png",
      byteSize: 4,
      filename: "approved.png",
      read: async () => Buffer.from("image-bytes"),
      signedUrl: null,
    };
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      const body = init?.body as FormData;
      expect(body.get("caption")).toBe("Approved caption");
      expect(body.get("published")).toBe("true");
      expect(body.get("source")).toBeInstanceOf(File);
      return Response.json({ id: "photo-id", post_id: "123456789012345_abc" });
    });
    await expect(facebookPageAdapter.publish(context({ shape: "photo", media: [media], fetch: fetchImpl }))).resolves.toMatchObject({
      status: "published",
      providerPostId: "123456789012345_abc",
    });
    await expect(facebookPageAdapter.publish(context({ shape: "carousel", media: [media, media] }))).resolves.toEqual({
      status: "failed",
      reason: "Facebook does not support carousel posts through this integration.",
    });
  });
});

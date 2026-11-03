import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDispatchSocialMediaUrl,
  resolveSocialMediaPublicBaseUrl,
  SOCIAL_MEDIA_URL_TTL_SECONDS,
  verifySignedSocialMediaToken,
} from "./public-media.js";

afterEach(() => vi.unstubAllEnvs());

describe("signed social publishing media URLs", () => {
  it("uses only a configured HTTPS origin and rejects local or malformed origins", () => {
    expect(resolveSocialMediaPublicBaseUrl({ SOCIALAGENT_PUBLIC_URL: "https://social.example" })).toBe("https://social.example");
    expect(resolveSocialMediaPublicBaseUrl({ SOCIALAGENT_PUBLIC_URL: "http://localhost:3100" })).toBeNull();
    expect(resolveSocialMediaPublicBaseUrl({ PAPERCLIP_PUBLIC_URL: "https://social.example/base" })).toBeNull();
    expect(resolveSocialMediaPublicBaseUrl({ PAPERCLIP_PUBLIC_URL: "not a URL" })).toBeNull();
  });

  it("signs an expiring capability for one company publication and immutable asset", () => {
    vi.stubEnv("PAPERCLIP_SECRETS_MASTER_KEY", "a".repeat(64));
    const now = Date.UTC(2026, 10, 3, 12);
    const claims = {
      companyId: randomUUID(),
      publicationId: randomUUID(),
      assetId: randomUUID(),
      sha256: "a".repeat(64),
    };
    const url = createDispatchSocialMediaUrl({ ...claims, publicBaseUrl: "https://social.example", now });
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://social.example");
    expect(parsed.pathname).toBe("/api/social-media/public-media");
    const token = parsed.searchParams.get("token")!;
    expect(verifySignedSocialMediaToken(token, now)).toEqual({
      ...claims,
      sha256: "a".repeat(64),
      expiresAt: Math.floor(now / 1000) + SOCIAL_MEDIA_URL_TTL_SECONDS,
    });
    expect(verifySignedSocialMediaToken(token, now + (SOCIAL_MEDIA_URL_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(verifySignedSocialMediaToken(`${token.slice(0, -1)}x`, now)).toBeNull();
  });

  it("does not issue a signed URL for an invalid asset identity or missing public base", () => {
    expect(createDispatchSocialMediaUrl({ companyId: "bad", publicationId: randomUUID(), assetId: randomUUID(), sha256: "a".repeat(64), publicBaseUrl: "https://social.example" })).toBeNull();
    expect(createDispatchSocialMediaUrl({ companyId: randomUUID(), publicationId: randomUUID(), assetId: randomUUID(), sha256: "a".repeat(64), publicBaseUrl: null })).toBeNull();
  });
});

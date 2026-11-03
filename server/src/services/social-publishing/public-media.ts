import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveLocalEncryptedInstanceSecret } from "../../secrets/local-encrypted-provider.js";

const TOKEN_PREFIX = "v1";
export const SOCIAL_MEDIA_URL_TTL_SECONDS = 60 * 60;
const SOCIAL_MEDIA_PATH = "/api/social-media/public-media";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

type SocialMediaClaims = {
  companyId: string;
  publicationId: string;
  assetId: string;
  sha256: string;
  expiresAt: number;
};

type PublicMediaEnv = Partial<Record<"SOCIALAGENT_PUBLIC_URL" | "PAPERCLIP_PUBLIC_URL", string | undefined>>;

export function resolveSocialMediaPublicBaseUrl(env: PublicMediaEnv = process.env): string | null {
  const raw = env.SOCIALAGENT_PUBLIC_URL?.trim() || env.PAPERCLIP_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function encodedPayload(claims: SocialMediaClaims): string {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

function signatureFor(payload: string): string {
  const secret = deriveLocalEncryptedInstanceSecret("agency-social-media-url");
  return createHmac("sha256", secret).update(`${TOKEN_PREFIX}.${payload}`).digest("base64url");
}

export function createSignedSocialMediaUrl(input: SocialMediaClaims & { publicBaseUrl: string }): string {
  const claims: SocialMediaClaims = {
    companyId: input.companyId,
    publicationId: input.publicationId,
    assetId: input.assetId,
    sha256: input.sha256.toLowerCase(),
    expiresAt: input.expiresAt,
  };
  const payload = encodedPayload(claims);
  const token = `${TOKEN_PREFIX}.${payload}.${signatureFor(payload)}`;
  const url = new URL(SOCIAL_MEDIA_PATH, input.publicBaseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function createDispatchSocialMediaUrl(input: {
  companyId: string;
  publicationId: string;
  assetId: string;
  sha256: string;
  publicBaseUrl: string | null;
  now?: number;
}): string | null {
  const publicBaseUrl = input.publicBaseUrl;
  if (!publicBaseUrl || !UUID_PATTERN.test(input.companyId) || !UUID_PATTERN.test(input.publicationId)
    || !UUID_PATTERN.test(input.assetId) || !SHA256_PATTERN.test(input.sha256)) return null;
  const now = input.now ?? Date.now();
  const expiresAt = Math.floor(now / 1000) + SOCIAL_MEDIA_URL_TTL_SECONDS;
  return createSignedSocialMediaUrl({
    companyId: input.companyId,
    publicationId: input.publicationId,
    assetId: input.assetId,
    sha256: input.sha256,
    publicBaseUrl,
    expiresAt,
  });
}

export function verifySignedSocialMediaToken(token: string, now = Date.now()): SocialMediaClaims | null {
  const [prefix, payload, suppliedSignature, ...extra] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !payload || !suppliedSignature || extra.length) return null;
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = Buffer.from(signatureFor(payload), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const claims = value as Partial<SocialMediaClaims>;
  const currentSeconds = Math.floor(now / 1000);
  if (typeof claims.companyId !== "string" || !UUID_PATTERN.test(claims.companyId)
    || typeof claims.publicationId !== "string" || !UUID_PATTERN.test(claims.publicationId)
    || typeof claims.assetId !== "string" || !UUID_PATTERN.test(claims.assetId)
    || typeof claims.sha256 !== "string" || !SHA256_PATTERN.test(claims.sha256)
    || typeof claims.expiresAt !== "number" || !Number.isSafeInteger(claims.expiresAt)
    || claims.expiresAt <= currentSeconds || claims.expiresAt > currentSeconds + SOCIAL_MEDIA_URL_TTL_SECONDS + 60) return null;
  return claims as SocialMediaClaims;
}

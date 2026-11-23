import "server-only";
import { sign, verifySignature } from "@/lib/crypto";

const PURPOSE = "social-media-url";
export const PUBLIC_MEDIA_TTL_SECONDS = 60 * 60;

/** Instagram fetches media by URL, so it needs a public HTTPS origin. */
export function publicBaseUrl() {
  const raw = process.env.PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.pathname === "/" && !url.search ? url.origin : null;
  } catch {
    return null;
  }
}

type Claims = { publicationId: string; assetId: string; exp: number };

export function signedMediaUrl(base: string, publicationId: string, assetId: string) {
  const payload = Buffer.from(JSON.stringify({ publicationId, assetId, exp: Math.floor(Date.now() / 1000) + PUBLIC_MEDIA_TTL_SECONDS } satisfies Claims)).toString("base64url");
  const url = new URL("/api/public-media", base);
  url.searchParams.set("token", `${payload}.${sign(PURPOSE, payload)}`);
  return url.toString();
}

export function readMediaToken(token: string): Claims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !verifySignature(PURPOSE, payload, signature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    return claims.exp > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}

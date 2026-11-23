import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Per-purpose key derived from the app secret, so one leaked key never unlocks another use. */
function keyFor(purpose: string) {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("APP_ENCRYPTION_KEY or BETTER_AUTH_SECRET must be set.");
  return Buffer.from(hkdfSync("sha256", secret, "socialagent", purpose, 32));
}

export function encryptJson(purpose: string, value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptJson<T>(purpose: string, sealed: string): T {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unsupported ciphertext.");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
}

export function sign(purpose: string, payload: string) {
  return createHmac("sha256", keyFor(purpose)).update(payload).digest("base64url");
}

export function verifySignature(purpose: string, payload: string, signature: string) {
  const expected = Buffer.from(sign(purpose, payload));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

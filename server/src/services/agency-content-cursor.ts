import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { deriveLocalEncryptedInstanceSecret } from "../secrets/local-encrypted-provider.js";

function key() {
  // The existing instance key is atomically persisted. Derive a separate key;
  // no new credential/configuration or per-item filesystem work is introduced.
  return createHash("sha256").update(deriveLocalEncryptedInstanceSecret("agency-content-cursor-v1")).digest();
}
export function sealContentCursor(scope: string, id: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const bytes = Buffer.concat([cipher.update(id, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
export function openContentCursor(scope: string, cursor: string) {
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.length < 29 || bytes.length > 1024) throw new Error("Malformed cursor");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(scope)); decipher.setAuthTag(bytes.subarray(12, 28));
    return z.string().guid().parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
  } catch { throw badRequest("Invalid content cursor. Refresh the content list."); }
}

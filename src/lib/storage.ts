import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-disk object storage. Swap for S3/R2/Blob in production by keeping this interface:
 * keys are opaque, objects are immutable once written.
 */
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? ".storage");

function resolve(key: string) {
  const full = path.resolve(/*turbopackIgnore: true*/ ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key.");
  return full;
}

export async function putObject(key: string, body: Buffer) {
  const full = resolve(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, body, { flag: "wx" });
}

export async function getObject(key: string) {
  return readFile(/*turbopackIgnore: true*/ resolve(key));
}

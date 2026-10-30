import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { loadConfig } from "../src/config.js";
import { createStorageServiceFromConfig } from "../src/storage/index.js";

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const config = loadConfig();
const storage = createStorageServiceFromConfig(config);
const companyId = `smoke-${randomUUID()}`;
const body = Buffer.from(`storage-smoke ${randomUUID()}`);
let objectKey: string | null = null;
let failure: string | null = null;

try {
  const put = await storage.putFile({
    companyId,
    namespace: "smoke",
    originalFilename: "smoke.txt",
    contentType: "text/plain",
    body,
  });
  objectKey = put.objectKey;
  const head = await storage.headObject(companyId, objectKey);
  if (!head.exists) throw new Error("head: object missing after put");
  if (head.contentLength !== undefined && head.contentLength !== body.length) {
    throw new Error(`head: size mismatch (${head.contentLength} != ${body.length})`);
  }
  const got = await storage.getObject(companyId, objectKey);
  const read = await readAll(got.stream);
  if (!read.equals(body)) throw new Error("get: content mismatch");
} catch (error) {
  failure = error instanceof Error ? error.message : "unknown error";
}

try {
  if (objectKey) {
    await storage.deleteObject(companyId, objectKey);
    const after = await storage.headObject(companyId, objectKey);
    if (after.exists && !failure) failure = "delete: object still exists";
  }
} catch (error) {
  if (!failure) failure = `delete: ${error instanceof Error ? error.message : "unknown error"}`;
}

if (failure) {
  console.error(`storage smoke failed (${config.storageProvider}): ${failure}`);
  process.exit(1);
}
console.log("ok");

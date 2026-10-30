import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, UploadPartCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { putS3Multipart } from "../storage/s3-multipart.js";
import { createS3StorageProvider } from "../storage/s3-provider.js";
import { createStorageProviderFromConfig } from "../storage/provider-registry.js";

const clientInits = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  class RecordingS3Client extends actual.S3Client {
    constructor(init: any) {
      clientInits.push(init);
      super(init);
    }
  }
  return { ...actual, S3Client: RecordingS3Client };
});

describe("streamed S3 multipart uploads", () => {
  it("streams exact ordered parts without buffering the full response", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const lengths: number[] = [];
    const send = vi.spyOn(client, "send").mockImplementation(async (command: any) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: "upload" };
      if (command instanceof UploadPartCommand) {
        expect(command.input.Body).toBeInstanceOf(Readable);
        let length = 0;
        for await (const chunk of command.input.Body as Readable) {
          expect(chunk.length).toBeLessThanOrEqual(64 * 1024);
          length += chunk.length;
        }
        expect(length).toBe(command.input.ContentLength);
        lengths.push(length);
        return { ETag: `part-${command.input.PartNumber}` };
      }
      expect(command).toBeInstanceOf(CompleteMultipartUploadCommand);
      expect(command.input.MultipartUpload.Parts).toEqual([1, 2, 3].map(PartNumber => ({ PartNumber, ETag: `part-${PartNumber}` })));
      return {};
    });
    const body = Readable.from((async function* () { for (let i = 0; i < 272; i++) yield Buffer.alloc(64 * 1024); })());
    try {
      await putS3Multipart(client, "bucket", "key", { objectKey: "key", contentType: "text/plain", contentLength: 17 * 1024 * 1024, body });
      expect(lengths).toEqual([8, 8, 1].map(mb => mb * 1024 * 1024));
    } finally { send.mockRestore(); client.destroy(); }
  });
  it("aborts an incomplete upload and closes its source on failure", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const send = vi.spyOn(client, "send").mockImplementation(async (command: any) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: "upload" };
      if (command instanceof UploadPartCommand) throw new Error("storage unavailable");
      expect(command).toBeInstanceOf(AbortMultipartUploadCommand);
      return {};
    });
    const body = Readable.from([Buffer.from("abc")]);
    try {
      await expect(putS3Multipart(client, "bucket", "key", { objectKey: "key", contentType: "text/plain", contentLength: 3, body })).rejects.toThrow("storage unavailable");
      expect(send).toHaveBeenCalledTimes(3);
      expect(body.destroyed).toBe(true);
    } finally { send.mockRestore(); client.destroy(); }
  });
});

describe("S3 provider explicit credentials", () => {
  const base = { bucket: "b", region: "us-east-1", endpoint: "https://x.supabase.co/storage/v1/s3", forcePathStyle: true };
  it("passes explicit credentials to the client when both are set", () => {
    clientInits.length = 0;
    createS3StorageProvider({ ...base, accessKeyId: "AKID", secretAccessKey: "SECRET" });
    expect(clientInits.at(-1)?.credentials).toEqual({ accessKeyId: "AKID", secretAccessKey: "SECRET" });
  });
  it("leaves credentials to the default AWS chain when none are set", () => {
    clientInits.length = 0;
    createS3StorageProvider(base);
    expect(clientInits.at(-1)).not.toHaveProperty("credentials");
  });
  it("forwards config credentials through the provider registry", () => {
    clientInits.length = 0;
    createStorageProviderFromConfig({
      storageProvider: "s3", storageS3Bucket: "b", storageS3Region: "r", storageS3Endpoint: "https://e",
      storageS3Prefix: "", storageS3ForcePathStyle: true,
      storageS3AccessKeyId: "AKID", storageS3SecretAccessKey: "SECRET",
    } as any);
    expect(clientInits.at(-1)?.credentials).toEqual({ accessKeyId: "AKID", secretAccessKey: "SECRET" });
  });
});

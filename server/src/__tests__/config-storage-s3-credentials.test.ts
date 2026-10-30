import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";

const KEYS = ["PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID", "PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("S3 storage credentials config", () => {
  it("loads both keys when both are set", () => {
    process.env.PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID = "AKID";
    process.env.PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY = "SECRET";
    const config = loadConfig();
    expect(config.storageS3AccessKeyId).toBe("AKID");
    expect(config.storageS3SecretAccessKey).toBe("SECRET");
  });
  it("leaves both undefined when neither is set", () => {
    delete process.env.PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY;
    const config = loadConfig();
    expect(config.storageS3AccessKeyId).toBeUndefined();
    expect(config.storageS3SecretAccessKey).toBeUndefined();
  });
  it("fails when only the access key id is set", () => {
    process.env.PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID = "AKID";
    delete process.env.PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY;
    expect(() => loadConfig()).toThrow(/PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY/);
  });
  it("fails when only the secret access key is set, without echoing it", () => {
    delete process.env.PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID;
    process.env.PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY = "TOPSECRET";
    expect(() => loadConfig()).toThrow(/PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID/);
    try { loadConfig(); } catch (e) { expect(String(e)).not.toContain("TOPSECRET"); }
  });
});

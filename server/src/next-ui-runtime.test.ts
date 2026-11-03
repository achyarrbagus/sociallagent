import { afterEach, describe, expect, it } from "vitest";
import { expressInternalApiOrigin, startNextUiRuntime } from "./next-ui-runtime.js";

const originalNodeBinary = process.env.PAPERCLIP_NODE_BINARY;

afterEach(() => {
  if (originalNodeBinary === undefined) delete process.env.PAPERCLIP_NODE_BINARY;
  else process.env.PAPERCLIP_NODE_BINARY = originalNodeBinary;
});

describe("expressInternalApiOrigin", () => {
  it("uses a loopback address for wildcard Express listeners", () => {
    expect(expressInternalApiOrigin("0.0.0.0", 31_000)).toBe("http://127.0.0.1:31000");
    expect(expressInternalApiOrigin("::", 31_000)).toBe("http://127.0.0.1:31000");
  });

  it("formats configured IPv4, hostname, and IPv6 bind addresses", () => {
    expect(expressInternalApiOrigin("127.0.0.1", 31_000)).toBe("http://127.0.0.1:31000");
    expect(expressInternalApiOrigin("paperclip.internal", 31_000)).toBe("http://paperclip.internal:31000");
    expect(expressInternalApiOrigin("::1", 31_000)).toBe("http://[::1]:31000");
  });

  it("does not hang when the configured Node runtime cannot spawn", async () => {
    process.env.PAPERCLIP_NODE_BINARY = "/missing/paperclip-node-runtime";
    await expect(startNextUiRuntime({
      expressApiOrigin: "http://127.0.0.1:3100",
      startupTimeoutMs: 100,
    })).rejects.toThrow(/spawn|Next.js UI process/i);
  }, 5_000);
});

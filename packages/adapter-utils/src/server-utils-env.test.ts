import { describe, expect, it } from "vitest";
import { SERVER_SECRET_ENV_PATTERNS, sanitizeInheritedPaperclipEnv, stripServerSecretEnv } from "./server-utils.js";

describe("sanitizeInheritedPaperclipEnv", () => {
  it("drops the host-only Paperclip CLI command pointer", () => {
    expect(sanitizeInheritedPaperclipEnv({
      PAPERCLIPAI_CMD: "node /missing/paperclipai/dist/index.js",
      PAPERCLIP_RUNTIME_API_URL: "http://127.0.0.1:3100",
      PATH: "/usr/bin",
    })).toEqual({
      PAPERCLIP_RUNTIME_API_URL: "http://127.0.0.1:3100",
      PATH: "/usr/bin",
    });
  });

  it("strips every server-held secret from the inherited env", () => {
    expect(sanitizeInheritedPaperclipEnv({
      DATABASE_URL: "x", DATABASE_MIGRATION_URL: "x", BETTER_AUTH_SECRET: "x",
      SOCIALAGENT_9ROUTER_API_KEY: "x", PAPERCLIP_STORAGE_S3_BUCKET: "x",
      AWS_SECRET_ACCESS_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", PATH: "/bin",
    })).toEqual({ PATH: "/bin" });
    expect(SERVER_SECRET_ENV_PATTERNS.length).toBeGreaterThan(0);
  });

  it("stripServerSecretEnv leaves non-secret keys alone", () => {
    expect(stripServerSecretEnv({ DATABASE_URL: "x", HOME: "/h", PAPERCLIP_API_URL: "u" }))
      .toEqual({ HOME: "/h", PAPERCLIP_API_URL: "u" });
  });

  it("keeps an agent-configured AWS_REGION while dropping the host AWS secret", () => {
    const merged = { ...sanitizeInheritedPaperclipEnv({ AWS_SECRET_ACCESS_KEY: "host", PATH: "/bin" }), AWS_REGION: "eu-west-1" };
    expect(merged).toEqual({ PATH: "/bin", AWS_REGION: "eu-west-1" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_SECRET_ENV_PATTERNS, sanitizeInheritedPaperclipEnv, stripServerSecretEnv } from "./server-utils.js";

describe("sanitizeInheritedPaperclipEnv", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("always strips signing secrets, master keys, tenant tokens and sandbox provider keys", () => {
    const host = {
      PAPERCLIP_AGENT_JWT_SECRET: "x",
      PAPERCLIP_SECRETS_MASTER_KEY: "x",
      PAPERCLIP_SECRETS_MASTER_KEY_FILE: "x",
      PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN: "x",
      PAPERCLIP_DECISION_SIGNING_SECRET: "x",
      PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: "x",
      PAPERCLIP_WORKSPACE_HANDOFF_SECRET: "x",
      PAPERCLIP_TOOL_OAUTH_SLACK_CLIENT_SECRET: "x",
      DAYTONA_API_KEY: "x",
      E2B_API_KEY: "x",
      NOVITA_API_KEY: "x",
      CREATEOS_API_KEY: "x",
      EXE_API_KEY: "x",
      PATH: "/bin",
    };
    expect(stripServerSecretEnv(host)).toEqual({ PATH: "/bin" });
  });
});

describe("server secret stripping outside SaaS mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("inherits AWS_* and SUPABASE_* when SaaS mode is off", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    expect(stripServerSecretEnv({
      AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b", AWS_REGION: "us-east-1",
      SUPABASE_URL: "u", PATH: "/bin",
    })).toEqual({
      AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b", AWS_REGION: "us-east-1",
      SUPABASE_URL: "u", PATH: "/bin",
    });
  });

  it("still strips the always-on server secrets when SaaS mode is off", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "");
    expect(stripServerSecretEnv({
      DATABASE_URL: "x", DATABASE_MIGRATION_URL: "x", BETTER_AUTH_SECRET: "x",
      SOCIALAGENT_9ROUTER_API_KEY: "x", PAPERCLIP_STORAGE_S3_BUCKET: "x",
      PAPERCLIP_AGENT_JWT_SECRET: "x", DAYTONA_API_KEY: "x", PATH: "/bin",
    })).toEqual({ PATH: "/bin" });
  });

  it("strips AWS_* and SUPABASE_* in SaaS mode", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    expect(stripServerSecretEnv({ AWS_SECRET_ACCESS_KEY: "b", SUPABASE_SERVICE_ROLE_KEY: "s", PATH: "/bin" }))
      .toEqual({ PATH: "/bin" });
  });
});

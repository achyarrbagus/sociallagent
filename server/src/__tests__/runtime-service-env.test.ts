import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeRuntimeServiceBaseEnv } from "../services/runtime-service-env.js";

describe("sanitizeRuntimeServiceBaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops server-held secrets and Paperclip runtime vars from the inherited env", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    const env = sanitizeRuntimeServiceBaseEnv({
      PATH: "/bin", HOME: "/h", DATABASE_URL: "x", BETTER_AUTH_SECRET: "x",
      SOCIALAGENT_9ROUTER_API_KEY: "x", AWS_SECRET_ACCESS_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x",
      PAPERCLIP_STORAGE_S3_SECRET: "x", PAPERCLIP_API_KEY: "x",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
  });

  it("keeps AWS_* and SUPABASE_* outside SaaS mode", () => {
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    const env = sanitizeRuntimeServiceBaseEnv({
      PATH: "/bin", DATABASE_URL: "x", AWS_SECRET_ACCESS_KEY: "a", SUPABASE_URL: "s",
    });
    expect(env).toEqual({ PATH: "/bin", AWS_SECRET_ACCESS_KEY: "a", SUPABASE_URL: "s" });
  });
});

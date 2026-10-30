import { describe, expect, it } from "vitest";
import { sanitizeRuntimeServiceBaseEnv } from "../services/runtime-service-env.js";

describe("sanitizeRuntimeServiceBaseEnv", () => {
  it("drops server-held secrets and Paperclip runtime vars from the inherited env", () => {
    const env = sanitizeRuntimeServiceBaseEnv({
      PATH: "/bin", HOME: "/h", DATABASE_URL: "x", BETTER_AUTH_SECRET: "x",
      SOCIALAGENT_9ROUTER_API_KEY: "x", AWS_SECRET_ACCESS_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x",
      PAPERCLIP_STORAGE_S3_SECRET: "x", PAPERCLIP_API_KEY: "x",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
  });
});

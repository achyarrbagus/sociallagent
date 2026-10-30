import { describe, expect, it } from "vitest";
import { parseSocialagentPublicUrl, readSocialagentPublicUrl } from "../socialagent-public-url.js";

describe("SOCIALAGENT_PUBLIC_URL parsing", () => {
  it("accepts https URLs and strips the trailing slash", () => {
    expect(parseSocialagentPublicUrl("https://app.example.com/")).toEqual({ url: "https://app.example.com", error: null });
    expect(parseSocialagentPublicUrl("  https://app.example.com/base//  ")).toEqual({ url: "https://app.example.com/base", error: null });
  });

  it.each(["http://localhost:3100", "http://127.0.0.1:3100/", "http://[::1]:3100"])("accepts plain http on loopback: %s", raw => {
    expect(parseSocialagentPublicUrl(raw).url).toBe(raw.replace(/\/+$/, ""));
    expect(parseSocialagentPublicUrl(raw).error).toBeNull();
  });

  it("treats a missing value as unset, not invalid", () => {
    expect(parseSocialagentPublicUrl(undefined)).toEqual({ url: null, error: null });
    expect(parseSocialagentPublicUrl("   ")).toEqual({ url: null, error: null });
  });

  it.each(["http://app.example.com", "ftp://app.example.com", "not a url", "http://10.0.0.5:3100"])("rejects %s", raw => {
    const parsed = parseSocialagentPublicUrl(raw);
    expect(parsed.url).toBeNull();
    expect(parsed.error).toMatch(/SOCIALAGENT_PUBLIC_URL/);
  });

  it("the reader returns null for an invalid value", () => {
    expect(readSocialagentPublicUrl({ SOCIALAGENT_PUBLIC_URL: "http://app.example.com" })).toBeNull();
    expect(readSocialagentPublicUrl({ SOCIALAGENT_PUBLIC_URL: "https://app.example.com/" })).toBe("https://app.example.com");
  });
});

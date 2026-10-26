import { describe, expect, it } from "vitest";
import { createAgencyClientSchema, createAgencyBrandSchema, updateAgencyBrandSchema } from "./agency.js";
import { createProjectSchema, updateProjectSchema } from "./project.js";

const clientId = "245bc352-56e1-4cca-903b-a47a6eb103b2";

describe("agency input contracts", () => {
  it("trims names and rejects empty names, spoofed company IDs and invalid emails", () => {
    expect(createAgencyClientSchema.parse({ name: "  Kopi  " }).name).toBe("Kopi");
    for (const value of [{ name: " " }, { name: "A", companyId: clientId }, { name: "A", contactEmail: "bad" }]) {
      expect(createAgencyClientSchema.safeParse(value).success).toBe(false);
    }
  });
  it("requires a client, validates website and timezone, and bounds the brief", () => {
    expect(createAgencyBrandSchema.parse({ name: "Kopi", clientId }).timezone).toBe("Asia/Jakarta");
    for (const change of [{ clientId: "bad" }, { websiteUrl: "javascript:alert(1)" }, { timezone: "invalid/zone" }, { brief: "a".repeat(20_001) }]) {
      expect(createAgencyBrandSchema.safeParse({ name: "Kopi", clientId, ...change }).success).toBe(false);
    }
  });
  it("does not reset brand context when patching a name", () => {
    expect(updateAgencyBrandSchema.parse({ name: "Updated" })).toEqual({ name: "Updated" });
  });
  it("preserves optional campaign brand bindings and supports explicit clearing", () => {
    expect(createProjectSchema.parse({ name: "Campaign", brandId: clientId }).brandId).toBe(clientId);
    expect(updateProjectSchema.parse({ brandId: null })).toEqual({ brandId: null });
    expect(updateProjectSchema.parse({ name: "Legacy" })).not.toHaveProperty("brandId");
  });
});

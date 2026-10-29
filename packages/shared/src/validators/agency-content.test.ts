import { describe, expect, it } from "vitest";
import { createAgencyContentSchema, reviseAgencyContentSchema, decideAgencyContentSchema } from "./agency-content.js";

const id = "7cbef872-9976-4cd1-920f-fbeac1c2a77d";
describe("agency content contracts", () => {
  it("requires brand and campaign identities and rejects spoofed approval state", () => {
    expect(createAgencyContentSchema.safeParse({ brandId: id, projectId: id, title: "Coffee story", idea: "Local farmers" }).success).toBe(true);
    for (const patch of [{ brandId: "foreign" }, { title: " " }, { status: "approved" }, { approvedRevisionNumber: 1 }]) {
      expect(createAgencyContentSchema.safeParse({ brandId: id, projectId: id, title: "Coffee story", ...patch }).success).toBe(false);
    }
  });
  it("requires an expected revision and bounds content and attachment input", () => {
    expect(reviseAgencyContentSchema.safeParse({ expectedRevisionNumber: 1, title: "Updated", caption: "Draft", attachmentIds: [id] }).success).toBe(true);
    for (const patch of [{ expectedRevisionNumber: 0 }, { expectedRevisionNumber: undefined }, { caption: "a".repeat(20_001) }, { attachmentIds: Array(21).fill(id) }]) {
      expect(reviseAgencyContentSchema.safeParse({ expectedRevisionNumber: 1, title: "Updated", ...patch }).success).toBe(false);
    }
  });
  it("requires revision feedback and rejects invented decisions", () => {
    expect(decideAgencyContentSchema.safeParse({ expectedRevisionNumber: 2, decision: "request_changes" }).success).toBe(false);
    expect(decideAgencyContentSchema.safeParse({ expectedRevisionNumber: 2, decision: "request_changes", note: "Shorten the hook" }).success).toBe(true);
    expect(decideAgencyContentSchema.safeParse({ expectedRevisionNumber: 2, decision: "publish" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { openContentCursor, sealContentCursor } from "./agency-content-cursor.js";

describe("private content pagination", () => {
  it("does not expose hidden content IDs and binds continuation to its actor/company/filter scope", () => {
    const id = "c250a79b-3f26-432e-94e7-2e00f41d0032";
    const token = sealContentCursor("company:owner:brand", id);
    expect(token).not.toContain(id);
    expect(Buffer.from(token, "base64url").toString()).not.toContain(id);
    expect(openContentCursor("company:owner:brand", token)).toBe(id);
    expect(() => openContentCursor("other-company:owner:brand", token)).toThrow(/cursor/i);
    expect(() => openContentCursor("company:owner:brand", `${token.slice(0, -4)}AAAA`)).toThrow(/cursor/i);
  });
});

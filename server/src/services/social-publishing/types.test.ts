import { describe, expect, it } from "vitest";
import { checkPostAgainstRules, mediaKindOf, postShapeOf, type PlatformRules } from "./types.js";
import { redactSecrets } from "./redact.js";

const rules: PlatformRules = { maxTextLength: 10, shapes: ["text", "photo", "carousel", "video"], carousel: { min: 2, max: 4, allowVideo: false }, maxImageBytes: 1024, maxVideoBytes: 2048, imageTypes: ["image/jpeg"], videoTypes: ["video/mp4"], publicUrlShapes: ["photo"] };
describe("social publishing rules", () => {
  it("classifies media and post shapes", () => {
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("video/mp4")).toBe("video");
    expect(mediaKindOf("application/pdf")).toBeNull();
    expect(postShapeOf([])).toBe("text");
    expect(postShapeOf([{ kind: "image" }])).toBe("photo");
    expect(postShapeOf([{ kind: "video" }])).toBe("video");
    expect(postShapeOf([{ kind: "image" }, { kind: "image" }])).toBe("carousel");
  });
  it("reports length, media and public URL restrictions", () => {
    expect(checkPostAgainstRules("Test", rules, { text: "12345678901", media: [] }, { publicBaseUrl: false })).toEqual(["Test allows at most 10 characters; this text has 11."]);
    expect(checkPostAgainstRules("Test", rules, { text: "", media: [{ kind: "image", contentType: "image/jpeg", byteSize: 1 }, { kind: "video", contentType: "video/mp4", byteSize: 1 }] }, { publicBaseUrl: true })).toContain("Test carousels cannot include videos.");
    expect(checkPostAgainstRules("Test", rules, { text: "", media: [{ kind: "image", contentType: "image/jpeg", byteSize: 1 }] }, { publicBaseUrl: false })).toContain("Test needs a public domain to fetch media. Set SOCIALAGENT_PUBLIC_URL.");
  });
  it("redacts credentials and token query parameters", () => {
    expect(redactSecrets("bad token EAABsecret123 at https://x/?access_token=EAAB999&a=1", ["EAABsecret123"])).toBe("bad token [redacted] at https://x/?access_token=[redacted]&a=1");
  });
});

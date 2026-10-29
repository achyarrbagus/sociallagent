import { describe, expect, it } from "vitest";
import { selectProjectFiles } from "./project-file-upload";

function file(path: string, size: number, type = "") {
  const value = new File([new Uint8Array(size)], path.split("/").pop()!, { type });
  Object.defineProperty(value, "webkitRelativePath", { value: path });
  return value;
}

describe("selectProjectFiles", () => {
  it("keeps supported files, drops hidden and unsupported ones", () => {
    const result = selectProjectFiles([
      file("Brand/logo.png", 10, "image/png"),
      file("Brand/brief.docx", 10),
      file("Brand/.DS_Store", 10),
      file("Brand/run.sh", 10, "application/x-sh"),
    ]);
    expect(result.files.map((f) => f.name)).toEqual(["logo.png", "brief.docx"]);
    expect(result.skipped).toBe(1);
    expect(result.error).toBeNull();
  });

  it("enforces the project limits before uploading", () => {
    expect(selectProjectFiles([file("a.png", 10, "image/png")], { count: 500, bytes: 0 }).error).toContain("500 files");
    expect(selectProjectFiles([file("a.mp4", 2, "video/mp4")], { count: 0, bytes: 100 * 1024 * 1024 - 1 }).error).toContain("100 MB");
  });
});

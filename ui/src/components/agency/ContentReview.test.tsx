// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgencyContentDetail } from "@paperclipai/shared";
import { ContentReview } from "./ContentReview";

let root: Root; let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); });
const base = { id: "content", status: "awaiting_owner", revisionNumber: 2, canManage: true, canEdit: true, contextCurrent: true, currentRevision: { revisionNumber: 2, title: "Coffee story", caption: "Caption", script: "", idea: "Story", hook: "Hook", cta: "Try it", format: "image", targetAccount: "@coffee", assets: [], decisions: [] } } as unknown as AgencyContentDetail;
function render(data: AgencyContentDetail, preview = data.currentRevision) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  const onDecide = vi.fn(); const onLatest = vi.fn();
  act(() => root.render(<ContentReview data={data} preview={preview} pending={false} onDecide={onDecide} onLatest={onLatest} />));
  return { onDecide, onLatest };
}
describe("content owner review", () => {
  it("binds approval to the displayed current revision", () => {
    const { onDecide } = render(base);
    act(() => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Approve content")!.click());
    expect(onDecide).toHaveBeenCalledWith({ expectedRevisionNumber: 2, decision: "approve", note: "" });
    expect(host.textContent).toContain("@coffee");
  });
  it("disables approval when a refreshed current revision differs from the preview", () => {
    const { onDecide, onLatest } = render({ ...base, revisionNumber: 3 }, base.currentRevision);
    const approve = Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Approve content")!;
    expect(approve.disabled).toBe(true); act(() => approve.click()); expect(onDecide).not.toHaveBeenCalled();
    act(() => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Review latest revision")!.click());
    expect(onLatest).toHaveBeenCalled();
  });
  it("offers idea selection separately and hides owner controls from other actors", () => {
    const { onDecide } = render({ ...base, status: "idea" });
    act(() => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Select idea for production")!.click());
    expect(onDecide).toHaveBeenCalledWith({ expectedRevisionNumber: 2, decision: "select_idea", note: "" });
    act(() => root.render(<ContentReview data={{ ...base, canManage: false }} preview={base.currentRevision} pending={false} onDecide={onDecide} onLatest={vi.fn()} />));
    expect(host.textContent).not.toContain("Approve content");
  });
});

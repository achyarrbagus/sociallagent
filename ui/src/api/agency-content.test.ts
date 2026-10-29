import { describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const issues = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("./client", () => ({ api: client }));
vi.mock("./issues", () => ({ issuesApi: issues }));
import { agencyContentApi } from "./agency-content";

describe("production task preparation", () => {
  it("creates in backlog and links before admitting normal task execution", async () => {
    const order: string[] = [];
    issues.create.mockImplementation(async (_company, input) => { expect(input.status).toBe("backlog"); expect(input.idempotencyKey).toBeTruthy(); expect(input.description).not.toContain("Farmers"); expect(input.title).not.toContain("Coffee"); order.push("create"); return { id: "task", status: "backlog", statusVersion: 3 }; });
    client.post.mockImplementation(async () => { order.push("link"); return {}; });
    issues.update.mockImplementation(async (_id, input) => { expect(input).toEqual({ status: "todo", expectedStatusVersion: 3 }); order.push("activate"); return {}; });
    await agencyContentApi.prepareTask("company", { id: "content", revisionNumber: 2, projectId: "project", title: "Coffee", currentRevision: { idea: "Farmers", caption: "", script: "" } } as never, "agent", "copywriting");
    expect(order).toEqual(["create", "link", "activate"]);
  });
  it("does not activate a task when linking to the current revision fails", async () => {
    issues.create.mockResolvedValue({ id: "task", status: "backlog" }); client.post.mockRejectedValue(new Error("Content changed")); issues.update.mockClear();
    await expect(agencyContentApi.prepareTask("company", { id: "content", revisionNumber: 2, projectId: "project", title: "Coffee", currentRevision: { idea: "Farmers", caption: "", script: "" } } as never, "agent", "design")).rejects.toThrow(/task.*backlog/i);
    expect(issues.update).not.toHaveBeenCalled();
  });
  it.each(["todo", "in_progress", "done", "cancelled"])("does not reset a reused %s task", async status => {
    issues.create.mockResolvedValue({ id: "task", status }); client.post.mockResolvedValue({}); issues.update.mockClear();
    await agencyContentApi.prepareTask("company", { id: "content", revisionNumber: 2, projectId: "project", title: "Private title", currentRevision: { idea: "Private idea", caption: "Private caption", script: "" } } as never, "agent", "design");
    expect(issues.update).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import type { AgencyPublication, Issue, Project } from "@paperclipai/shared";
import { activeCampaigns, campaignProgress, scheduledPublications, todayRange } from "./today-overview";

describe("agency daily overview", () => {
  it("includes only nonarchived brand campaigns in planned or active states", () => {
    const projects = [
      { id: "active", brandId: "brand", status: "in_progress" },
      { id: "planned", brandId: "brand", status: "planned" },
      { id: "done", brandId: "brand", status: "completed" },
      { id: "archived", brandId: "brand", status: "in_progress", archivedAt: new Date() },
      { id: "unbranded", status: "in_progress" },
    ] as Project[];
    expect(activeCampaigns(projects).map(p => p.id)).toEqual(["active", "planned"]);
  });

  it("computes campaign completion from its noncancelled tasks only", () => {
    const issues = [
      { projectId: "p", status: "done" }, { projectId: "p", status: "in_progress" },
      { projectId: "p", status: "cancelled" }, { projectId: "other", status: "done" },
    ] as Issue[];
    expect(campaignProgress("p", issues)).toEqual({ completed: 1, total: 2, percent: 50 });
    expect(campaignProgress("empty", issues)).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("uses seven local calendar days and filters scheduled posts with exclusive end", () => {
    const range = todayRange(new Date(2026, 9, 29, 15));
    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getDate()).toBe(5);
    const posts = [
      { id: "end", status: "scheduled", scheduledAt: range.to },
      { id: "published", status: "published", scheduledAt: range.from },
      { id: "later", status: "scheduled", scheduledAt: new Date(2026, 9, 30).toISOString() },
      { id: "first", status: "scheduled", scheduledAt: range.from },
      { id: "old", status: "scheduled", scheduledAt: new Date(2026, 9, 28).toISOString() },
    ] as AgencyPublication[];
    expect(scheduledPublications(posts, range).map(p => p.id)).toEqual(["first", "later"]);
  });
});

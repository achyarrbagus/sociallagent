import type { AgencyPublication, Issue, Project } from "@paperclipai/shared";

export function todayRange(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function activeCampaigns(projects: Project[]) {
  return projects.filter(project => project.brandId && !project.archivedAt
    && (project.status === "planned" || project.status === "in_progress"));
}

export function campaignProgress(projectId: string, issues: Issue[]) {
  const tasks = issues.filter(issue => issue.projectId === projectId && issue.status !== "cancelled");
  const completed = tasks.filter(issue => issue.status === "done").length;
  return { completed, total: tasks.length, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}

export function scheduledPublications(posts: AgencyPublication[], range: { from: string; to: string }) {
  const start = new Date(range.from).getTime();
  const end = new Date(range.to).getTime();
  return posts.filter(post => post.status === "scheduled"
    && new Date(post.scheduledAt).getTime() >= start && new Date(post.scheduledAt).getTime() < end)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

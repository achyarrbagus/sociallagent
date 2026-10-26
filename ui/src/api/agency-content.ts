import type { AgencyContentDetail, AgencyContentHistoryPage, AgencyContentPage, AgencyContentRevision, CreateAgencyContent, DecideAgencyContent, LinkAgencyContentTask, ListAgencyContent, ReviseAgencyContent } from "@paperclipai/shared";
import { api } from "./client";
import { issuesApi } from "./issues";

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/content-items`;
const item = (companyId: string, id: string) => `${base(companyId)}/${encodeURIComponent(id)}`;
export const agencyContentApi = {
  list: (companyId: string, filters: ListAgencyContent = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1]));
    return api.get<AgencyContentPage>(`${base(companyId)}?${params}`);
  },
  get: (companyId: string, id: string) => api.get<AgencyContentDetail>(item(companyId, id)),
  create: (companyId: string, data: CreateAgencyContent) => api.post<AgencyContentDetail>(base(companyId), data),
  revise: (companyId: string, id: string, data: ReviseAgencyContent) => api.post<AgencyContentDetail>(`${item(companyId, id)}/revisions`, data),
  submit: (companyId: string, id: string, expectedRevisionNumber: number) => api.post<AgencyContentDetail>(`${item(companyId, id)}/submit`, { expectedRevisionNumber }),
  decide: (companyId: string, id: string, data: DecideAgencyContent) => api.post<AgencyContentDetail>(`${item(companyId, id)}/decisions`, data),
  linkTask: (companyId: string, id: string, data: LinkAgencyContentTask) => api.post<AgencyContentDetail>(`${item(companyId, id)}/tasks`, data),
  history: (companyId: string, id: string, before?: number) => api.get<AgencyContentHistoryPage>(`${item(companyId, id)}/revisions${before ? `?before=${before}` : ""}`),
  revision: (companyId: string, id: string, number: number) => api.get<AgencyContentRevision>(`${item(companyId, id)}/revisions/${number}`),
  async prepareTask(companyId: string, content: AgencyContentDetail, assigneeAgentId: string, role: LinkAgencyContentTask["role"]) {
    const key = `content:${content.id}:${content.revisionNumber}:${role}:${assigneeAgentId}`;
    const task = await issuesApi.create(companyId, {
      title: `${role}: agency content production`, projectId: content.projectId, assigneeAgentId, status: "backlog", idempotencyKey: key, allowDuplicate: true,
      description: `Produce ${role} work for authorized content reference ${content.id}, revision ${content.revisionNumber}.\n\nRead the authorized brand brief and content context through GET /api/companies/${companyId}/content-items/${content.id}. Do not copy private source material into this task. If access is denied, request the required source permissions from the owner. Save a new content revision through the authorized content API when the deliverable is ready. Task completion does not approve content. Only the agency owner decides final approval.`,
    });
    try {
      await agencyContentApi.linkTask(companyId, content.id, { issueId: task.id, role, expectedRevisionNumber: content.revisionNumber });
      if (task.status === "backlog") {
        if (typeof task.statusVersion !== "number") throw new Error("Task version unavailable; reload before starting it");
        await issuesApi.update(task.id, { status: "todo", expectedStatusVersion: task.statusVersion });
      }
    } catch (error) {
      throw new Error(`Task ${task.id} already exists in backlog or is linked. ${error instanceof Error ? error.message : "Preparation failed"}. Reload and retry this preparation or link the existing task; do not create a duplicate.`);
    }
    return task;
  },
};

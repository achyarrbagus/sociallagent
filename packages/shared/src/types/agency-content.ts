export const AGENCY_CONTENT_STATUSES = ["idea", "in_production", "awaiting_owner", "changes_requested", "approved", "rejected"] as const;
export type AgencyContentStatus = (typeof AGENCY_CONTENT_STATUSES)[number];
export const AGENCY_CONTENT_FORMATS = ["text", "image", "carousel", "video"] as const;
export const AGENCY_CONTENT_DECISIONS = ["select_idea", "approve", "request_changes", "reject"] as const;
export const AGENCY_PRODUCTION_ROLES = ["creative", "strategy", "copywriting", "design", "seo", "marketing", "analysis"] as const;

export interface AgencyContentAsset {
  attachmentId: string;
  assetId: string;
  issueId: string;
  sha256: string;
  filename: string;
  contentType: string;
  byteSize: number;
}
export interface AgencyContentSnapshot {
  title: string;
  idea: string;
  hook: string;
  caption: string;
  script: string;
  cta: string;
  format: (typeof AGENCY_CONTENT_FORMATS)[number];
  targetAccount: string;
  assets: AgencyContentAsset[];
  brandUpdatedAt: string;
  clientUpdatedAt: string;
  projectDescription: string | null;
}
export interface AgencyContentDecision {
  id: string;
  revisionNumber: number;
  decision: (typeof AGENCY_CONTENT_DECISIONS)[number];
  note: string | null;
  decidedByUserId: string;
  createdAt: Date;
}
export interface AgencyContentRevision extends AgencyContentSnapshot {
  revisionNumber: number;
  createdAt: Date;
  createdByActorId: string;
  createdByActorType: string;
  decisions: AgencyContentDecision[];
}
export interface AgencyContentSummary {
  id: string;
  companyId: string;
  brandId: string;
  projectId: string;
  title: string;
  status: AgencyContentStatus;
  revisionNumber: number;
  approvedRevisionNumber: number | null;
  approvalValid: boolean;
  contextCurrent: boolean;
  canManage: boolean;
  canEdit: boolean;
  updatedAt: Date;
}
export interface AgencyContentDetail extends AgencyContentSummary {
  currentRevision: AgencyContentRevision;
  tasks: Array<{ issueId: string; title: string; status: string; assigneeAgentId: string | null; role: string }>;
}
export interface AgencyContentPage { items: AgencyContentSummary[]; nextCursor: string | null }
export interface AgencyContentHistoryPage {
  revisions: Array<{ revisionNumber: number; title: string; createdAt: Date; createdByActorId: string }>;
  nextBefore: number | null;
}

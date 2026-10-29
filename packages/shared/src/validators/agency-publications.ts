import { z } from "zod";

export const AGENCY_PUBLICATION_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "x", "youtube", "other"] as const;
export type AgencyPublicationPlatform = (typeof AGENCY_PUBLICATION_PLATFORMS)[number];
export const AGENCY_PUBLICATION_STATUSES = ["scheduled", "published", "failed", "cancelled"] as const;
export type AgencyPublicationStatus = (typeof AGENCY_PUBLICATION_STATUSES)[number];

/**
 * Schedule an approved content revision on one platform. `agent` hands the
 * post to the agency's Publishing Coordinator at the scheduled time (it posts
 * through the company's connectors); `manual` keeps it on the calendar for
 * the owner to post and mark.
 */
export const createAgencyPublicationSchema = z.object({
  contentId: z.string().uuid(),
  platform: z.enum(AGENCY_PUBLICATION_PLATFORMS),
  accountLabel: z.string().trim().max(200).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }),
  dispatch: z.enum(["agent", "manual"]).default("agent"),
}).strict();
export type CreateAgencyPublication = z.infer<typeof createAgencyPublicationSchema>;

export const completeAgencyPublicationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("published"), externalUrl: z.string().trim().url().max(2048).optional().nullable() }).strict(),
  z.object({ status: z.literal("failed"), failureReason: z.string().trim().min(1).max(2000) }).strict(),
]);
export type CompleteAgencyPublication = z.infer<typeof completeAgencyPublicationSchema>;

export const listAgencyPublicationsSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  brandId: z.string().uuid().optional(),
});

export interface AgencyPublication {
  id: string;
  companyId: string;
  contentId: string;
  contentTitle: string;
  brandId: string;
  brandName: string;
  revisionNumber: number;
  platform: AgencyPublicationPlatform;
  accountLabel: string | null;
  scheduledAt: string;
  timezone: string;
  dispatch: "agent" | "manual";
  status: AgencyPublicationStatus;
  /** False when the content was revised or its approval was withdrawn after scheduling. */
  approvalCurrent: boolean;
  caption: string | null;
  script: string | null;
  format: string | null;
  assets: Array<{ assetId: string; filename: string | null; contentType: string | null; contentPath: string }>;
  agentId: string | null;
  externalUrl: string | null;
  failureReason: string | null;
  publishedAt: string | null;
  createdAt: string;
}

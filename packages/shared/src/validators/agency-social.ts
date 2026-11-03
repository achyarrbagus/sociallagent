import { z } from "zod";
export const SOCIAL_CONNECTOR_PLATFORMS = ["facebook", "instagram", "x", "linkedin", "tiktok"] as const;
export type SocialConnectorPlatform = typeof SOCIAL_CONNECTOR_PLATFORMS[number];
export const connectSocialAccountSchema = z.object({ brandId: z.string().uuid(), platform: z.enum(SOCIAL_CONNECTOR_PLATFORMS), credentials: z.record(z.string(), z.string().trim().min(1).max(4096)) }).strict();
export const replaceSocialCredentialsSchema = z.object({ credentials: z.record(z.string(), z.string().trim().min(1).max(4096)) }).strict();
export const publicationPlanSlotSchema = z.object({ socialAccountId: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }), text: z.string().max(10000).optional().nullable() }).strict();
export type PublicationPlanSlot = z.infer<typeof publicationPlanSlotSchema>;

export interface AgencySocialAccount {
  id: string;
  companyId: string;
  brandId: string;
  platform: SocialConnectorPlatform;
  displayName: string;
  externalAccountId: string;
  status: "active" | "revoked";
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
}
export const proposePublicationPlanSchema = z.object({ issueId: z.string().uuid(), contentId: z.string().uuid(), revisionNumber: z.number().int().positive(), slots: z.array(publicationPlanSlotSchema).min(1).max(8) }).strict();
export const scheduleConnectedSchema = proposePublicationPlanSchema.omit({ issueId: true });

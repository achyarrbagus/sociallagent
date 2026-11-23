import { z } from "zod";

export const PUBLICATION_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "x", "youtube", "other"] as const;
export const PUBLICATION_STATUS_LABELS = {
  scheduled: "Terjadwal",
  publishing: "Sedang dipublikasikan",
  published: "Terbit",
  failed: "Gagal",
  unknown: "Perlu dicek",
  cancelled: "Dibatalkan",
} as const;
export const PUBLICATION_PLATFORM_LABELS: Record<(typeof PUBLICATION_PLATFORMS)[number], string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", youtube: "YouTube", other: "Lainnya",
};

export const schedulePublicationInput = z.object({
  platform: z.enum(PUBLICATION_PLATFORMS),
  socialAccountId: z.string().trim().default(""),
  accountLabel: z.string().trim().max(200).default(""),
  // datetime-local value interpreted in the brand's timezone.
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Tanggal dan jam wajib diisi"),
  postText: z.string().trim().max(63206).default(""),
});

export const completePublicationInput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("published"), externalUrl: z.union([z.literal(""), z.string().trim().url("URL tidak valid").max(2000)]).default("") }),
  z.object({ status: z.literal("failed"), failureReason: z.string().trim().min(1, "Tulis alasannya").max(2000) }),
]);

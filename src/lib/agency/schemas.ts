import { z } from "zod";

const optional = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null).nullable().optional();

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Tanggal tidak valid")
  .nullable()
  .optional();

export const clientInput = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  description: optional(5000),
  contactName: optional(200),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Email tidak valid").max(320)])
    .transform((v) => v || null).nullable().optional(),
});

export const brandInput = z.object({
  clientId: z.string().min(1, "Pilih klien"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  websiteUrl: z.union([z.literal(""), z.string().trim().url("URL tidak valid").max(2000)])
    .transform((v) => v || null).nullable().optional(),
  audience: optional(5000),
  toneOfVoice: optional(5000),
  brief: optional(20000),
  timezone: z.string().trim().min(1).max(64).default("Asia/Jakarta"),
});

export const CAMPAIGN_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;

export const CAMPAIGN_STATUS_LABELS: Record<(typeof CAMPAIGN_STATUSES)[number], string> = {
  planned: "Direncanakan",
  in_progress: "Produksi",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const campaignInput = z.object({
  brandId: z.string().min(1, "Pilih brand"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  objective: optional(5000),
  status: z.enum(CAMPAIGN_STATUSES).default("planned"),
  startDate: optionalDate,
  targetDate: optionalDate,
});

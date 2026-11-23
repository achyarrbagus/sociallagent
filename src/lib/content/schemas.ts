import { z } from "zod";

export const CONTENT_STATUSES = ["idea", "in_production", "awaiting_owner", "changes_requested", "approved", "rejected"] as const;
export const CONTENT_FORMATS = ["text", "image", "carousel", "video"] as const;
export const CONTENT_DECISIONS = ["select_idea", "approve", "request_changes", "reject"] as const;
export const PRODUCTION_ROLES = ["creative", "strategy", "copywriting", "design", "seo", "marketing", "analysis"] as const;

export type ContentStatusValue = (typeof CONTENT_STATUSES)[number];
export type ContentDecisionValue = (typeof CONTENT_DECISIONS)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatusValue, string> = {
  idea: "Ide",
  in_production: "Produksi",
  awaiting_owner: "Menunggu review",
  changes_requested: "Perlu revisi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export const CONTENT_FORMAT_LABELS: Record<(typeof CONTENT_FORMATS)[number], string> = {
  text: "Teks",
  image: "Gambar",
  carousel: "Carousel",
  video: "Video",
};

export const PRODUCTION_ROLE_LABELS: Record<(typeof PRODUCTION_ROLES)[number], string> = {
  creative: "Kreatif",
  strategy: "Strategi",
  copywriting: "Copywriting",
  design: "Desain",
  seo: "SEO",
  marketing: "Marketing",
  analysis: "Analisis",
};

const text = (max: number) => z.string().trim().max(max).default("");

/** Every revision stores the complete field set; omitted fields mean empty. */
export const snapshotInput = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(200),
  idea: text(10000),
  hook: text(5000),
  caption: text(20000),
  script: text(20000),
  cta: text(2000),
  format: z.enum(CONTENT_FORMATS).default("text"),
  targetAccount: text(300),
  assetIds: z.array(z.string().min(1)).max(20).refine((ids) => new Set(ids).size === ids.length, "Media duplikat").default([]),
});
export type SnapshotInput = z.infer<typeof snapshotInput>;

export const createContentInput = z.object({
  brandId: z.string().min(1, "Pilih brand"),
  campaignId: z.string().min(1, "Pilih campaign"),
  title: z.string().trim().min(1, "Judul wajib diisi").max(200),
  idea: text(10000),
});

export const reviseContentInput = snapshotInput.extend({
  expectedRevisionNumber: z.coerce.number().int().positive(),
});

export const decideContentInput = z.object({
  expectedRevisionNumber: z.coerce.number().int().positive(),
  decision: z.enum(CONTENT_DECISIONS),
  note: z.string().trim().max(5000).default(""),
}).refine((v) => v.decision !== "request_changes" || v.note.length > 0, {
  message: "Tulis feedback sebelum meminta revisi.",
  path: ["note"],
});

export const assignTaskInput = z.object({
  agentId: z.string().min(1, "Pilih agent"),
  role: z.enum(PRODUCTION_ROLES),
  instructions: z.string().trim().max(5000).default(""),
});

export const MEDIA_TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
};
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

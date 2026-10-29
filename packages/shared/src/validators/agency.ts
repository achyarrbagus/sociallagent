import { z } from "zod";
import { objectWithoutDefaults } from "./partial.js";

const name = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const archivedAt = z.string().datetime().nullable().optional();
const timezone = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}, "Use a valid timezone, such as Asia/Jakarta.");

export const createAgencyClientSchema = z.object({
  name,
  description: text(5000),
  contactName: text(200),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
}).strict();
export const updateAgencyClientSchema = createAgencyClientSchema.partial().extend({ archivedAt }).strict();

export const createAgencyBrandSchema = z.object({
  clientId: z.string().guid(),
  name,
  websiteUrl: z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS website URL.").nullable().optional(),
  audience: text(5000),
  toneOfVoice: text(5000),
  brief: text(20_000),
  timezone: timezone.default("Asia/Jakarta"),
}).strict();
export const updateAgencyBrandSchema = objectWithoutDefaults(createAgencyBrandSchema).partial().extend({ archivedAt }).strict();

export type CreateAgencyClient = z.infer<typeof createAgencyClientSchema>;
export type UpdateAgencyClient = z.infer<typeof updateAgencyClientSchema>;
export type CreateAgencyBrand = z.infer<typeof createAgencyBrandSchema>;
export type UpdateAgencyBrand = z.infer<typeof updateAgencyBrandSchema>;

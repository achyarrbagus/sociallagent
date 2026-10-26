import { z } from "zod";
import { AGENCY_CONTENT_DECISIONS, AGENCY_CONTENT_FORMATS, AGENCY_CONTENT_STATUSES, AGENCY_PRODUCTION_ROLES } from "../types/agency-content.js";

const text = (max: number) => z.string().trim().max(max).optional().default("");
export const agencyContentSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(200),
  idea: text(10000), hook: text(5000), caption: text(20000), script: text(20000), cta: text(2000),
  format: z.enum(AGENCY_CONTENT_FORMATS).optional().default("text"),
  targetAccount: text(300),
  attachmentIds: z.array(z.string().guid()).max(20).refine(ids => new Set(ids).size === ids.length, "Choose each attachment once.").optional().default([]),
}).strict();
export const createAgencyContentSchema = agencyContentSnapshotSchema.extend({ brandId: z.string().guid(), projectId: z.string().guid() }).strict();
export const contentRevisionExpectationSchema = z.object({ expectedRevisionNumber: z.number().int().min(1) }).strict();
export const reviseAgencyContentSchema = agencyContentSnapshotSchema.extend(contentRevisionExpectationSchema.shape).strict();
export const decideAgencyContentSchema = contentRevisionExpectationSchema.extend({
  decision: z.enum(AGENCY_CONTENT_DECISIONS), note: z.string().trim().max(5000).optional(),
}).strict().refine(value => value.decision !== "request_changes" || Boolean(value.note), { message: "Explain the changes needed.", path: ["note"] });
export const linkAgencyContentTaskSchema = contentRevisionExpectationSchema.extend({ issueId: z.string().guid(), role: z.enum(AGENCY_PRODUCTION_ROLES) }).strict();
export const listAgencyContentSchema = z.object({
  brandId: z.string().guid().optional(), projectId: z.string().guid().optional(),
  cursor: z.string().min(1).max(1024).optional(), status: z.enum(AGENCY_CONTENT_STATUSES).optional(),
}).strict();
export type CreateAgencyContent = z.infer<typeof createAgencyContentSchema>;
export type ReviseAgencyContent = z.infer<typeof reviseAgencyContentSchema>;
export type DecideAgencyContent = z.infer<typeof decideAgencyContentSchema>;
export type LinkAgencyContentTask = z.infer<typeof linkAgencyContentTaskSchema>;
export type ListAgencyContent = z.infer<typeof listAgencyContentSchema>;

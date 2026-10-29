import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { AgencyContentSnapshot, AgencyContentStatus } from "@paperclipai/shared";
import { companies } from "./companies.js";
import { agencyBrands } from "./agency_brands.js";
import { projects } from "./projects.js";

export const agencyContentItems = pgTable("agency_content_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull(), projectId: uuid("project_id").notNull(),
  title: text("title").notNull(), status: text("status").$type<AgencyContentStatus>().notNull().default("idea"),
  revisionNumber: integer("revision_number").notNull().default(1),
  approvedRevisionNumber: integer("approved_revision_number"),
  assetSourceIds: jsonb("asset_source_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  companyIdUq: unique("agency_content_company_id_uq").on(t.companyId, t.id),
  brandFk: foreignKey({ name: "agency_content_brand_fk", columns: [t.companyId, t.brandId], foreignColumns: [agencyBrands.companyId, agencyBrands.id] }),
  projectFk: foreignKey({ name: "agency_content_project_fk", columns: [t.companyId, t.projectId], foreignColumns: [projects.companyId, projects.id] }).onDelete("cascade"),
  companyIdx: index("agency_content_company_id_idx").on(t.companyId, t.id),
  brandIdx: index("agency_content_company_brand_idx").on(t.companyId, t.brandId),
  projectIdx: index("agency_content_company_project_idx").on(t.companyId, t.projectId),
  reviewIdx: index("agency_content_company_status_idx").on(t.companyId, t.status, t.id),
  stateCheck: check("agency_content_status_check", sql`${t.status} in ('idea','in_production','awaiting_owner','changes_requested','approved','rejected')`),
  revisionCheck: check("agency_content_revision_check", sql`${t.revisionNumber} > 0 and (${t.approvedRevisionNumber} is null or (${t.status} = 'approved' and ${t.approvedRevisionNumber} = ${t.revisionNumber}))`),
}));

export const agencyContentRevisions = pgTable("agency_content_revisions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull(), contentId: uuid("content_id").notNull(),
  revisionNumber: integer("revision_number").notNull(), snapshot: jsonb("snapshot").$type<AgencyContentSnapshot>().notNull(),
  createdByActorType: text("created_by_actor_type").notNull(), createdByActorId: text("created_by_actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  contentFk: foreignKey({ name: "agency_revision_content_fk", columns: [t.companyId, t.contentId], foreignColumns: [agencyContentItems.companyId, agencyContentItems.id] }).onDelete("cascade"),
  revisionUq: unique("agency_revision_content_number_uq").on(t.companyId, t.contentId, t.revisionNumber),
}));

export const agencyContentDecisions = pgTable("agency_content_decisions", {
  id: uuid("id").primaryKey().defaultRandom(), companyId: uuid("company_id").notNull(), contentId: uuid("content_id").notNull(),
  revisionNumber: integer("revision_number").notNull(), decision: text("decision").notNull(), note: text("note"),
  decidedByUserId: text("decided_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  revisionFk: foreignKey({ name: "agency_decision_revision_fk", columns: [t.companyId, t.contentId, t.revisionNumber], foreignColumns: [agencyContentRevisions.companyId, agencyContentRevisions.contentId, agencyContentRevisions.revisionNumber] }).onDelete("cascade"),
  decisionCheck: check("agency_content_decision_check", sql`${t.decision} in ('select_idea','approve','request_changes','reject')`),
  contentIdx: index("agency_decision_content_idx").on(t.companyId, t.contentId, t.revisionNumber),
}));

// Logical issue identities are retained after issue deletion so losing a private
// source cannot widen content access. A missing source fails closed.
export const agencyContentTasks = pgTable("agency_content_tasks", {
  companyId: uuid("company_id").notNull(), contentId: uuid("content_id").notNull(), issueId: uuid("issue_id").notNull(),
  role: text("role").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  pk: primaryKey({ columns: [t.contentId, t.issueId] }),
  contentFk: foreignKey({ name: "agency_task_content_fk", columns: [t.companyId, t.contentId], foreignColumns: [agencyContentItems.companyId, agencyContentItems.id] }).onDelete("cascade"),
  companyIssueIdx: index("agency_content_task_issue_idx").on(t.companyId, t.issueId),
}));

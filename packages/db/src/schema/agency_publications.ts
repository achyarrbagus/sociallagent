import { pgTable, uuid, text, integer, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { agencyContentItems } from "./agency_content.js";
import { agents } from "./agents.js";

/**
 * SocialAgent content calendar: one approved content revision scheduled for
 * one platform. `snapshot` keeps the approved caption, script and assets so
 * the publisher works from exactly what the owner approved.
 */
export const agencyPublications = pgTable(
  "agency_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").notNull().references(() => agencyContentItems.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    platform: text("platform").notNull(),
    accountLabel: text("account_label"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    dispatch: text("dispatch").notNull(),
    status: text("status").notNull().default("scheduled"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    routineId: uuid("routine_id"),
    externalUrl: text("external_url"),
    failureReason: text("failure_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyScheduleIdx: index("agency_publications_company_schedule_idx").on(table.companyId, table.scheduledAt),
    contentIdx: index("agency_publications_content_idx").on(table.companyId, table.contentId),
    statusCheck: check("agency_publications_status_check", sql`${table.status} in ('scheduled', 'published', 'failed', 'cancelled')`),
    dispatchCheck: check("agency_publications_dispatch_check", sql`${table.dispatch} in ('agent', 'manual')`),
  }),
);

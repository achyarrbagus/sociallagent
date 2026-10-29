import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { assets } from "./assets.js";

/**
 * SocialAgent: files an owner uploads into a project (a folder of brand
 * assets, briefs or references). The bytes live in `assets`; this row keeps
 * the project link and the path inside the uploaded folder.
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("project_files_project_idx").on(table.companyId, table.projectId),
    projectPathUq: uniqueIndex("project_files_project_path_uq").on(table.projectId, table.relativePath),
  }),
);

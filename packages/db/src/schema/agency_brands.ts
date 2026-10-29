import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agencyClients } from "./agency_clients.js";

export const agencyBrands = pgTable("agency_brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  audience: text("audience"),
  toneOfVoice: text("tone_of_voice"),
  brief: text("brief"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  companyIdUq: unique("agency_brands_company_id_uq").on(t.companyId, t.id),
  clientFk: foreignKey({ columns: [t.companyId, t.clientId], foreignColumns: [agencyClients.companyId, agencyClients.id] }).onDelete("cascade"),
  clientIdx: index("agency_brands_company_client_idx").on(t.companyId, t.clientId),
}));

import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const agencyClients = pgTable("agency_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  companyIdUq: unique("agency_clients_company_id_uq").on(t.companyId, t.id),
  companyIdx: index("agency_clients_company_idx").on(t.companyId),
}));

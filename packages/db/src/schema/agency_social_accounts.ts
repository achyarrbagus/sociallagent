import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agencyBrands } from "./agency_brands.js";

export const agencySocialAccounts = pgTable("agency_social_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull().references(() => agencyBrands.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  displayName: text("display_name").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  credentialsSecretId: uuid("credentials_secret_id"),
  status: text("status").notNull().default("active"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ brandPlatformUq: unique("agency_social_accounts_brand_platform_uq").on(table.companyId, table.brandId, table.platform), companyIdx: index("agency_social_accounts_company_idx").on(table.companyId, table.brandId) }));

import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const instanceCreditSettings = pgTable("instance_credit_settings", {
  singletonKey: text("singleton_key").primaryKey().default("default"),
  allowanceMicrounits: bigint("allowance_microunits", { mode: "bigint" }).notNull(),
  rates: jsonb("rates").$type<{ input: number; cachedInput: number; output: number }>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ positive: check("instance_credit_settings_nonnegative", sql`${t.allowanceMicrounits} >= 0`) }));

export const companyCreditPolicies = pgTable("company_credit_policies", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  allowanceMicrounits: bigint("allowance_microunits", { mode: "bigint" }).notNull(),
  rates: jsonb("rates").$type<{ input: number; cachedInput: number; output: number }>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ positive: check("company_credit_policies_nonnegative", sql`${t.allowanceMicrounits} >= 0`) }));

export const companyCreditCharges = pgTable("company_credit_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Retain billing history if a run or its agent is deleted. Service validates company scope.
  runId: uuid("run_id").notNull(),
  amountMicrounits: bigint("amount_microunits", { mode: "bigint" }).notNull(),
  inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull(),
  cachedInputTokens: bigint("cached_input_tokens", { mode: "bigint" }).notNull(),
  outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull(),
  rates: jsonb("rates").$type<{ input: number; cachedInput: number; output: number }>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ runUnique: uniqueIndex("company_credit_charges_company_run_uq").on(t.companyId, t.runId), period: index("company_credit_charges_company_occurred_idx").on(t.companyId, t.occurredAt), amounts: check("company_credit_charges_nonnegative", sql`${t.amountMicrounits} >= 0 and ${t.inputTokens} >= 0 and ${t.cachedInputTokens} >= 0 and ${t.outputTokens} >= 0`) }));

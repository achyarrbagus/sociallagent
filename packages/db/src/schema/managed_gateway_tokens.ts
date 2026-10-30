import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Run-scoped bearer tokens for the managed 9Router gateway proxy. A sandbox
 * only ever receives the plaintext token; the operator's master key stays on
 * the server. Only the SHA-256 hash of a token is stored.
 */
export const managedGatewayTokens = pgTable("managed_gateway_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Not a foreign key: a probe token is bound to a synthetic run id, and the
  // proxy revalidates the heartbeat row (company-scoped) on every request.
  runId: uuid("run_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({ run: index("managed_gateway_tokens_run_idx").on(t.runId) }));

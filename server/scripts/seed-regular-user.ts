/**
 * Seeds one regular (non-admin) board user for local testing of the
 * SocialAgent SaaS lock. The user signs in with email and password and owns
 * one company, but is never an instance admin.
 *
 * Usage (server running or not; the database must be reachable):
 *   pnpm --filter @paperclipai/server exec tsx scripts/seed-regular-user.ts
 *
 * Defaults are local test values only. Override with:
 *   SEED_USER_EMAIL, SEED_USER_PASSWORD, SEED_USER_NAME,
 *   SEED_COMPANY_ID   attach to an existing company instead of creating one
 *   SEED_COMPANY_NAME name for the new company (default "Regular User Agency")
 *   DATABASE_URL      defaults to the embedded dev database
 *
 * Re-running is safe: an existing user keeps its id and gets a new password,
 * and an existing membership is left as is.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { authAccounts, authUsers, companies, companyMemberships, createDb } from "@paperclipai/db";
import { ensureHumanRoleDefaultGrants } from "../src/services/principal-access-compatibility.js";

const email = (process.env.SEED_USER_EMAIL ?? "user@socialagent.test").trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD ?? "socialagent-user-123";
const name = process.env.SEED_USER_NAME ?? "Regular User";
const url = process.env.DATABASE_URL ?? "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";

const db = createDb(url);
const now = new Date();

let [user] = await db.select().from(authUsers).where(eq(authUsers.email, email));
if (!user) {
  [user] = await db.insert(authUsers).values({
    id: randomUUID().replaceAll("-", ""),
    name,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  }).returning();
}
const userId = user!.id;

const passwordHash = await hashPassword(password);
const [credential] = await db.select().from(authAccounts).where(and(
  eq(authAccounts.userId, userId),
  eq(authAccounts.providerId, "credential"),
));
if (credential) {
  await db.update(authAccounts).set({ password: passwordHash, updatedAt: now }).where(eq(authAccounts.id, credential.id));
} else {
  await db.insert(authAccounts).values({
    id: randomUUID().replaceAll("-", ""),
    issuer: "local:credential",
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });
}

let companyId = process.env.SEED_COMPANY_ID?.trim();
if (!companyId) {
  const companyName = process.env.SEED_COMPANY_NAME ?? "Regular User Agency";
  const [existing] = await db.select().from(companies).where(eq(companies.name, companyName));
  companyId = existing?.id;
  if (!companyId) {
    const id = randomUUID();
    await db.insert(companies).values({
      id,
      name: companyName,
      issuePrefix: `U${id.replaceAll("-", "").slice(0, 5).toUpperCase()}`,
    });
    companyId = id;
  }
}

const [membership] = await db.select().from(companyMemberships).where(and(
  eq(companyMemberships.companyId, companyId),
  eq(companyMemberships.principalType, "user"),
  eq(companyMemberships.principalId, userId),
));
if (!membership) {
  await db.insert(companyMemberships).values({
    companyId,
    principalType: "user",
    principalId: userId,
    status: "active",
    membershipRole: "owner",
    updatedAt: now,
  });
}
await ensureHumanRoleDefaultGrants(db, { companyId, principalId: userId, membershipRole: "owner", grantedByUserId: null });

console.log(`Regular user ready: ${email} (owner of company ${companyId}, not an instance admin).`);
console.log("Sign in at http://127.0.0.1:3100 with the email and the password from SEED_USER_PASSWORD or this script's default.");
process.exit(0);

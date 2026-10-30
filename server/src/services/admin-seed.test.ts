import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authAccounts, authUsers, companyMemberships, companies, createDb, getEmbeddedPostgresTestSupport, instanceUserRoles, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { verifyPassword } from "better-auth/crypto";
import { seedAdmin } from "./admin-seed.js";

const support = await getEmbeddedPostgresTestSupport();
(support.supported ? describe : describe.skip)("admin seeder", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("admin-seed-");
    db = createDb(temporary.connectionString);
  }, 60_000);
  afterAll(async () => { await db?.$client.end(); await temporary?.cleanup(); });

  it("creates a credential-backed instance admin with access to the selected company and refuses to overwrite it", async () => {
    const [company] = await db.insert(companies).values({ name: "Seed test", issuePrefix: "SAA" }).returning();
    const input = { name: "Admin", email: "admin@example.test", password: "secure-test-password", companyId: company.id };
    const userId = await seedAdmin(db, input);
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId));
    const [account] = await db.select().from(authAccounts).where(eq(authAccounts.userId, userId));
    const [role] = await db.select().from(instanceUserRoles).where(eq(instanceUserRoles.userId, userId));
    const [membership] = await db.select().from(companyMemberships).where(eq(companyMemberships.principalId, userId));
    expect(user.email).toBe(input.email);
    expect(await verifyPassword({ hash: account.password!, password: input.password })).toBe(true);
    expect(role.role).toBe("instance_admin");
    expect(membership).toMatchObject({ companyId: company.id, status: "active", membershipRole: "owner" });
    await expect(seedAdmin(db, input)).rejects.toThrow(/already exists/i);
  });
});

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { authAccounts, authUsers, companies, companyMemberships, instanceUserRoles, type Db } from "@paperclipai/db";
import { hashPassword } from "better-auth/crypto";

export async function seedAdmin(db: Db, input: { name: string; email: string; password: string; companyId: string }): Promise<string> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A name and valid email are required");
  if (input.password.length < 8 || input.password.length > 128) throw new Error("Password must be 8–128 characters");
  if (!input.companyId) throw new Error("A company ID is required");
  const password = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId));
    if (!company) throw new Error("Company not found");
    const [existing] = await tx.select({ id: authUsers.id }).from(authUsers).where(sql`lower(${authUsers.email}) = ${email}`);
    if (existing) throw new Error("An account with this email already exists");
    const userId = randomUUID();
    const now = new Date();
    await tx.insert(authUsers).values({ id: userId, name, email, emailVerified: true, createdAt: now, updatedAt: now });
    await tx.insert(authAccounts).values({ id: randomUUID(), issuer: "local:credential", accountId: userId, providerId: "credential", userId, password, createdAt: now, updatedAt: now });
    await tx.insert(instanceUserRoles).values({ userId, role: "instance_admin" });
    await tx.insert(companyMemberships).values({ companyId: company.id, principalType: "user", principalId: userId, status: "active", membershipRole: "owner" });
    return userId;
  });
}

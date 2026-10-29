import { and, eq } from "drizzle-orm";
import { companyMemberships, type Db } from "@paperclipai/db";
import type { AuthorizationActor } from "./authorization.js";

export function isAgencyOwner(actor: AuthorizationActor, companyId: string) {
  return actor.type === "board" && (actor.source === "local_implicit" || Boolean(actor.memberships?.some(m => m.companyId === companyId && m.status === "active" && m.membershipRole === "owner")));
}

export async function currentAgencyOwner(db: Db, actor: AuthorizationActor, companyId: string, lock = false) {
  if (!isAgencyOwner(actor, companyId)) return false;
  if (actor.source === "local_implicit") return true;
  const query = db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
    eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"),
    eq(companyMemberships.principalId, actor.userId ?? ""), eq(companyMemberships.status, "active"), eq(companyMemberships.membershipRole, "owner"),
  ));
  return Boolean((await (lock ? query.for("share") : query))[0]);
}

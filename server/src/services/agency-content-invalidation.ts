import { and, eq, inArray } from "drizzle-orm";
import { agencyBrands, agencyContentItems, type Db } from "@paperclipai/db";

/** Caller holds the brand/client mutation lock; content writers lock parents
 * before content rows, so stale approval cannot survive a context edit. */
export async function invalidateAgencyBrandContent(db: Db, companyId: string, brandIds: string[]) {
  if (!brandIds.length) return;
  await db.update(agencyContentItems).set({ status: "changes_requested", approvedRevisionNumber: null, updatedAt: new Date() })
    .where(and(eq(agencyContentItems.companyId, companyId), inArray(agencyContentItems.brandId, brandIds), inArray(agencyContentItems.status, ["approved", "awaiting_owner"])));
}
export async function invalidateAgencyClientContent(db: Db, companyId: string, clientId: string) {
  const brands = await db.select({ id: agencyBrands.id }).from(agencyBrands).where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.clientId, clientId)));
  await invalidateAgencyBrandContent(db, companyId, brands.map(b => b.id));
}
export async function invalidateAgencyProjectContent(db: Db, companyId: string, projectId: string) {
  await db.update(agencyContentItems).set({ status: "changes_requested", approvedRevisionNumber: null, updatedAt: new Date() })
    .where(and(eq(agencyContentItems.companyId, companyId), eq(agencyContentItems.projectId, projectId), inArray(agencyContentItems.status, ["approved", "awaiting_owner"])));
}

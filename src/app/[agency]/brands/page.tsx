import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { BrandsWorkspace } from "./BrandsWorkspace";

export default async function BrandsPage({ params }: PageProps<"/[agency]/brands">) {
  const { agency: slug } = await params;
  const { agency, canManage } = await requireAgency(slug);
  const where = { organizationId: agency.id };
  const [clients, brands, campaigns, accounts] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" } }),
    // Never select credentials into a page.
    prisma.socialAccount.findMany({
      where: { ...where, status: "active" },
      select: { id: true, brandId: true, platform: true, displayName: true, externalAccountId: true, tokenExpiresAt: true },
    }),
  ]);
  const socialAccounts = accounts.map((a) => ({ ...a, tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null }));
  return <BrandsWorkspace slug={slug} canManage={canManage} clients={clients} brands={brands} campaigns={campaigns} socialAccounts={socialAccounts} />;
}

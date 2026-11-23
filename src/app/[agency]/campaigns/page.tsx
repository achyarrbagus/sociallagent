import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { CampaignsWorkspace } from "./CampaignsWorkspace";

export default async function CampaignsPage({ params }: PageProps<"/[agency]/campaigns">) {
  const { agency: slug } = await params;
  const { agency, canManage } = await requireAgency(slug);
  const where = { organizationId: agency.id };
  const [clients, brands, campaigns] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where, orderBy: [{ status: "asc" }, { targetDate: "asc" }] }),
  ]);
  return <CampaignsWorkspace slug={slug} canManage={canManage} clients={clients} brands={brands} campaigns={campaigns} />;
}

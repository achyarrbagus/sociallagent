import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { CampaignDetail } from "./CampaignDetail";

export default async function CampaignPage({ params }: PageProps<"/[agency]/campaigns/[campaignId]">) {
  const { agency: slug, campaignId } = await params;
  const { agency, canManage } = await requireAgency(slug);
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: agency.id },
    include: { brand: { include: { client: true } } },
  });
  if (!campaign) notFound();
  const brands = await prisma.brand.findMany({ where: { organizationId: agency.id }, orderBy: { name: "asc" } });
  return <div className="space-y-6">
    <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
      <Link href={`/${slug}/campaigns`} className="underline-offset-4 hover:underline">Campaign</Link> / {campaign.name}
    </nav>
    <CampaignDetail slug={slug} canManage={canManage} campaign={campaign} brands={brands} />
  </div>;
}

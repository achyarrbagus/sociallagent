import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/agency/EmptyState";
import { ContentFilters } from "@/components/content/ContentFilters";
import { NewIdea } from "@/components/content/NewIdea";
import { StatusBadge } from "@/components/content/StatusBadge";
import { displayStatus, isContextCurrent } from "@/lib/content/lifecycle";
import { CONTENT_STATUSES, type ContentStatusValue } from "@/lib/content/schemas";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

export default async function ContentPage({ params, searchParams }: PageProps<"/[agency]/content">) {
  const { agency: slug } = await params;
  const query = await searchParams;
  const { agency, canManage } = await requireAgency(slug);
  const brandId = typeof query.brandId === "string" ? query.brandId : "";
  const status = typeof query.status === "string" && (CONTENT_STATUSES as readonly string[]).includes(query.status) ? query.status as ContentStatusValue : "";
  const where = { organizationId: agency.id };

  const [brands, campaigns, items] = await Promise.all([
    prisma.brand.findMany({ where, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where: { ...where, status: { not: "cancelled" } }, orderBy: { name: "asc" } }),
    prisma.content.findMany({
      where: { ...where, ...(brandId ? { brandId } : {}) },
      include: { brand: { include: { client: true } }, campaign: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  const rows = items
    .map((item) => {
      const contextCurrent = isContextCurrent(item, item.revisions[0], item);
      return { item, shown: displayStatus(item, contextCurrent), approved: item.status === "approved" && contextCurrent };
    })
    .filter((row) => !status || row.shown === status);
  const activeBrands = brands.filter((b) => !b.archivedAt && !b.client.archivedAt);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Konten &amp; Review Owner</h1><p className="text-sm text-muted-foreground">Pilih ide, koordinasikan produksi dengan tim AI, dan review revisi final.</p></div>
      {canManage && <NewIdea slug={slug} brands={activeBrands.map(({ id, name }) => ({ id, name }))} campaigns={campaigns.map(({ id, name, brandId }) => ({ id, name, brandId }))} initialBrand={brandId} />}
    </div>
    <ContentFilters brands={brands.map(({ id, name }) => ({ id, name }))} brandId={brandId} status={status} />
    {!rows.length && <EmptyState icon={FileText} message={items.length ? "Tidak ada konten yang cocok dengan filter ini." : "Belum ada konten. Mulai dari satu ide."} />}
    {rows.map(({ item, shown, approved }) => <Link key={item.id} href={`/${slug}/content/${item.id}`} className="block space-y-2 rounded-lg border bg-card p-4 hover:bg-accent/40">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">{item.title}</h2><StatusBadge status={shown} /></div>
      <p className="text-sm text-muted-foreground">{item.brand.name} · {item.campaign.name} · Revisi {item.revisionNumber}{approved ? " · Disetujui owner" : ""}</p>
    </Link>)}
  </div>;
}

import Link from "next/link";
import { Share2 } from "lucide-react";
import { EmptyState } from "@/components/agency/EmptyState";
import { SocialAccounts } from "@/components/social/SocialAccounts";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

/** Every active brand's connected accounts in one place (port of socialagent /social-accounts). */
export default async function SocialPage({ params }: PageProps<"/[agency]/social">) {
  const { agency: slug } = await params;
  const { agency, canManage } = await requireAgency(slug);
  const [brands, accounts] = await Promise.all([
    prisma.brand.findMany({ where: { organizationId: agency.id, archivedAt: null, client: { archivedAt: null } }, include: { client: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.socialAccount.findMany({
      where: { organizationId: agency.id, status: "active" },
      select: { id: true, brandId: true, platform: true, displayName: true, externalAccountId: true, tokenExpiresAt: true },
    }),
  ]);
  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">Akun Sosial</h1><p className="text-sm text-muted-foreground">Hubungkan akun tiap brand untuk publikasi otomatis. Kredensial diverifikasi dan disimpan terenkripsi.</p></div>
    {!brands.length && <EmptyState icon={Share2} message="Belum ada brand aktif." />}
    {!brands.length && <p className="text-center text-sm"><Link href={`/${slug}/brands`} className="underline">Tambah klien &amp; brand</Link></p>}
    {brands.map((brand) => <section key={brand.id} className="space-y-3 rounded-lg border bg-card p-4">
      <div><h2 className="text-lg font-semibold">{brand.name}</h2><p className="text-sm text-muted-foreground">{brand.client.name} · {brand.timezone}</p></div>
      <SocialAccounts slug={slug} brandId={brand.id} canManage={canManage}
        accounts={accounts.filter((a) => a.brandId === brand.id).map((a) => ({ ...a, tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null }))} />
    </section>)}
  </div>;
}

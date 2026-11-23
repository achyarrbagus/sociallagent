"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { FolderKanban } from "lucide-react";
import { AgencyForm, agencySelectClass, type AgencyFormTarget } from "@/components/agency/AgencyForm";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/agency/schemas";
import { EmptyState } from "@/components/agency/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BrandRow, CampaignRow, ClientRow } from "@/lib/agency/types";

const formatDate = (d: Date | null) => d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Belum ditentukan";

export function CampaignsWorkspace({ slug, canManage, clients, brands, campaigns }: {
  slug: string;
  canManage: boolean;
  clients: ClientRow[];
  brands: BrandRow[];
  campaigns: CampaignRow[];
}) {
  const [form, setForm] = useState<AgencyFormTarget | null>(null);
  const [brandFilter, setBrandFilter] = useState("");
  const closeForm = useCallback(() => setForm(null), []);
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "Brand";
  const activeBrands = brands.filter((b) => !b.archivedAt);
  const visible = campaigns.filter((c) => !brandFilter || c.brandId === brandFilter);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Campaign</h1><p className="text-sm text-muted-foreground">Semua campaign dari setiap brand yang kamu kelola.</p></div>
      {canManage && <Button onClick={() => setForm({ kind: "campaign" })} disabled={!!form || !activeBrands.length}>Campaign baru</Button>}
    </div>
    {canManage && !activeBrands.length && <p className="text-sm text-muted-foreground">Buat brand dulu di <Link className="underline" href={`/${slug}/brands`}>Klien &amp; Brand</Link> sebelum membuat campaign.</p>}
    {form && <AgencyForm key={JSON.stringify(form)} slug={slug} form={form} clients={clients} brands={brands} onDone={closeForm} />}
    <div className="max-w-xs">
      <label htmlFor="brand-filter" className="sr-only">Filter brand</label>
      <select id="brand-filter" className={agencySelectClass} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
        <option value="">Semua brand</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
    {!visible.length ? <EmptyState icon={FolderKanban} message="Belum ada campaign." /> :
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th className="p-3">Campaign / Brand</th><th className="p-3">Mulai</th><th className="p-3">Target selesai</th><th className="p-3">Status</th></tr></thead>
          <tbody>{visible.map((c) => <tr key={c.id} className="border-t">
            <td className="p-3"><Link href={`/${slug}/campaigns/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.name}</Link><span className="block text-muted-foreground">{brandName(c.brandId)}</span></td>
            <td className="p-3">{formatDate(c.startDate)}</td>
            <td className="p-3">{formatDate(c.targetDate)}</td>
            <td className="p-3"><Badge variant="outline">{CAMPAIGN_STATUS_LABELS[c.status]}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}

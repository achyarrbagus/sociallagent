"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { AgencyForm, type AgencyFormTarget } from "@/components/agency/AgencyForm";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/agency/schemas";
import { EmptyState } from "@/components/agency/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SocialAccounts, type AccountView } from "@/components/social/SocialAccounts";
import { setArchived } from "@/lib/agency/actions";
import type { BrandRow, CampaignRow, ClientRow } from "@/lib/agency/types";

export function BrandsWorkspace({ slug, canManage, clients, brands, campaigns, socialAccounts }: {
  slug: string;
  canManage: boolean;
  clients: ClientRow[];
  brands: BrandRow[];
  campaigns: CampaignRow[];
  socialAccounts: (AccountView & { brandId: string })[];
}) {
  const [form, setForm] = useState<AgencyFormTarget | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const closeForm = useCallback(() => setForm(null), []);
  const archive = (kind: "client" | "brand", id: string, archived: boolean) => startTransition(async () => {
    setError(null);
    try { await setArchived(slug, kind, id, archived); }
    catch (e) { setError(e instanceof Error ? e.message : "Aksi gagal."); }
  });
  const busy = pending || !!form;
  const visibleClients = clients.filter((c) => showArchived || !c.archivedAt);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Klien &amp; Brand</h1><p className="text-sm text-muted-foreground">Kelola konteks brand dan hubungkan campaign ke klien yang dilayani agensi kamu.</p></div>
      {canManage && <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setForm({ kind: "client" })} disabled={busy}>Klien baru</Button>
        <Button onClick={() => setForm({ kind: "brand" })} disabled={busy || !clients.some((c) => !c.archivedAt)}>Brand baru</Button>
      </div>}
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Tampilkan yang diarsipkan</label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {form && <AgencyForm key={JSON.stringify(form)} slug={slug} form={form} clients={clients} brands={brands} onDone={closeForm} />}
    {visibleClients.length === 0 && <EmptyState icon={Building2} message={clients.length ? "Tidak ada klien aktif. Centang \"Tampilkan yang diarsipkan\" untuk melihat pekerjaan sebelumnya." : "Belum ada klien. Tambahkan klien, lalu buat brand-nya."} />}
    {visibleClients.map((client) => <section key={client.id} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{client.name}</h2>{client.archivedAt && <Badge variant="secondary">Diarsipkan</Badge>}</div>
          {(client.contactName || client.contactEmail) && <p className="text-sm text-muted-foreground">{[client.contactName, client.contactEmail].filter(Boolean).join(" · ")}</p>}
          {client.description && <p className="whitespace-pre-wrap text-sm">{client.description}</p>}
        </div>
        {canManage && <div className="flex flex-wrap items-center gap-2">
          {!client.archivedAt && <Button size="sm" variant="outline" onClick={() => setForm({ kind: "brand", clientId: client.id })} disabled={busy}>Tambah brand</Button>}
          <Button size="sm" variant="ghost" onClick={() => setForm({ kind: "client", value: client })} disabled={busy}>Ubah klien</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => archive("client", client.id, !client.archivedAt)}>{client.archivedAt ? "Pulihkan klien" : "Arsipkan klien"}</Button>
        </div>}
      </div>
      {brands.filter((b) => b.clientId === client.id && (showArchived || !b.archivedAt)).map((brand) => {
        const brandCampaigns = campaigns.filter((c) => c.brandId === brand.id);
        return <article key={brand.id} className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1"><div className="flex items-center gap-2"><h3 className="font-medium">{brand.name}</h3>{brand.archivedAt && <Badge variant="secondary">Diarsipkan</Badge>}</div>
              <p className="text-sm text-muted-foreground">{brand.timezone}{brand.websiteUrl ? ` · ${brand.websiteUrl}` : ""}</p></div>
            {canManage && <div className="flex flex-wrap items-center gap-2">
              {!brand.archivedAt && !client.archivedAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => setForm({ kind: "campaign", brandId: brand.id })}>Tambah campaign</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForm({ kind: "brand", value: brand })}>Ubah brand</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => archive("brand", brand.id, !brand.archivedAt)}>{brand.archivedAt ? "Pulihkan brand" : "Arsipkan brand"}</Button>
            </div>}
          </div>
          {brand.audience && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Audiens: </span>{brand.audience}</p>}
          {brand.toneOfVoice && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Tone: </span>{brand.toneOfVoice}</p>}
          {brand.brief && <p className="whitespace-pre-wrap text-sm">{brand.brief}</p>}
          <Link href={`/${slug}/content?brandId=${brand.id}`} className="text-sm underline">Lihat konten</Link>
          <SocialAccounts slug={slug} brandId={brand.id} canManage={canManage && !brand.archivedAt && !client.archivedAt}
            accounts={socialAccounts.filter((a) => a.brandId === brand.id)} />
          <div className="space-y-2"><h4 className="text-sm font-medium">Campaign</h4>
            {brandCampaigns.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link className="underline underline-offset-4" href={`/${slug}/campaigns/${c.id}`}>{c.name}</Link>
              <Badge variant="outline">{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
            </div>)}
            {!brandCampaigns.length && <p className="text-sm text-muted-foreground">Belum ada campaign.</p>}
          </div>
        </article>;
      })}
      {!brands.some((b) => b.clientId === client.id && (showArchived || !b.archivedAt)) && <p className="text-sm text-muted-foreground">Belum ada brand untuk ditampilkan.</p>}
    </section>)}
  </div>;
}

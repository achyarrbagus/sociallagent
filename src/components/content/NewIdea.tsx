"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createContentAction, type ActionState } from "@/lib/content/actions";

export function NewIdea({ slug, brands, campaigns, initialBrand }: {
  slug: string;
  brands: { id: string; name: string }[];
  campaigns: { id: string; name: string; brandId: string }[];
  initialBrand: string;
}) {
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState(initialBrand);
  const [state, action, pending] = useActionState<ActionState, FormData>(createContentAction.bind(null, slug), { ok: false });
  if (!open) return <Button onClick={() => setOpen(true)} disabled={!brands.length}>Ide baru</Button>;
  const brandCampaigns = campaigns.filter((c) => c.brandId === brandId);
  return <form action={action} className="w-full space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Ide konten baru</h2>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <fieldset className="space-y-4" disabled={pending}>
      <div className="space-y-2"><Label htmlFor="new-content-brand">Brand</Label>
        <select id="new-content-brand" name="brandId" className={agencySelectClass} value={brandId} required onChange={(e) => setBrandId(e.target.value)}>
          <option value="" disabled>Pilih brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></div>
      <div className="space-y-2"><Label htmlFor="new-content-campaign">Campaign</Label>
        <select key={brandId} id="new-content-campaign" name="campaignId" required defaultValue="" className={agencySelectClass}>
          <option value="" disabled>Pilih campaign</option>{brandCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {brandId && !brandCampaigns.length && <p className="text-sm text-muted-foreground">Brand ini belum punya campaign. Buat di <Link href={`/${slug}/brands`} className="underline">Klien &amp; Brand</Link>.</p>}
      </div>
      <div className="space-y-2"><Label htmlFor="new-content-title">Judul</Label><Input id="new-content-title" name="title" required maxLength={200} /></div>
      <div className="space-y-2"><Label htmlFor="new-content-idea">Ide / insight audiens</Label><Textarea id="new-content-idea" name="idea" maxLength={10000} /></div>
    </fieldset>
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button>
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan ide"}</Button>
    </div>
  </form>;
}

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createContentAction, type ActionState } from "@/lib/content/actions";

export type BriefOptions = { brands: { id: string; name: string }[]; campaigns: { id: string; name: string; brandId: string }[] };

/** "Buat brief" from anywhere: a new content idea, then straight to its page. */
export function BriefDialog({ slug, open, onOpenChange, options }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void; options: BriefOptions }) {
  const [brandId, setBrandId] = useState(options.brands.length === 1 ? options.brands[0].id : "");
  const [state, action, pending] = useActionState<ActionState, FormData>(createContentAction.bind(null, slug), { ok: false });
  const campaigns = options.campaigns.filter((c) => c.brandId === brandId);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Buat brief</DialogTitle><DialogDescription>Ide baru masuk ke Konten dengan status Ide. Pilih untuk produksi saat siap.</DialogDescription></DialogHeader>
      {!options.brands.length ? <p className="text-sm text-muted-foreground">Belum ada brand aktif. <Link href={`/${slug}/brands`} className="underline" onClick={() => onOpenChange(false)}>Tambah klien &amp; brand</Link> dulu.</p> :
        <form action={action} className="space-y-4">
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="brief-brand">Brand</Label>
                <select id="brief-brand" name="brandId" required className={agencySelectClass} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="" disabled>Pilih brand</option>{options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select></div>
              <div className="space-y-2"><Label htmlFor="brief-campaign">Campaign</Label>
                <select key={brandId} id="brief-campaign" name="campaignId" required defaultValue={campaigns.length === 1 ? campaigns[0].id : ""} className={agencySelectClass}>
                  <option value="" disabled>Pilih campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            {brandId && !campaigns.length && <p className="text-sm text-muted-foreground">Brand ini belum punya campaign aktif.</p>}
            <div className="space-y-2"><Label htmlFor="brief-title">Judul</Label><Input id="brief-title" name="title" required maxLength={200} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="brief-idea">Ide / insight audiens</Label><Textarea id="brief-idea" name="idea" maxLength={10000} rows={4} /></div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan brief"}</Button>
          </div>
        </form>}
    </DialogContent>
  </Dialog>;
}

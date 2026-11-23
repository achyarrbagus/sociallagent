"use client";

import { useActionState, useState, useTransition } from "react";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import type { AssetView } from "./ContentMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviseContentAction, submitContentAction, type ActionState } from "@/lib/content/actions";
import { CONTENT_FORMATS, CONTENT_FORMAT_LABELS, type ContentStatusValue } from "@/lib/content/schemas";

type Revision = {
  revisionNumber: number; title: string; idea: string; hook: string; caption: string; script: string; cta: string;
  format: (typeof CONTENT_FORMATS)[number]; targetAccount: string; assetIds: string[];
};

const FIELDS = [["idea", "Ide / insight audiens", 10000], ["hook", "Hook", 5000], ["caption", "Caption", 20000], ["script", "Script", 20000], ["cta", "CTA", 2000]] as const;

export function ContentEditor({ slug, contentId, status, revision, contextCurrent, assets }: {
  slug: string; contentId: string; status: ContentStatusValue; revision: Revision; contextCurrent: boolean; assets: AssetView[];
}) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await reviseContentAction(slug, contentId, prev, form);
    if (result.ok) setOpen(false);
    return result;
  }, { ok: false });
  const submit = () => startSubmit(async () => {
    setSubmitError(null);
    const result = await submitContentAction(slug, contentId, revision.revisionNumber);
    if (!result.ok) setSubmitError(result.error ?? "Gagal mengirim.");
  });
  const busy = pending || submitting;

  if (!open) return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>Edit sebagai revisi baru</Button>
      {status === "in_production" && <Button disabled={busy || !contextCurrent} onClick={submit}>{submitting ? "Mengirim…" : "Kirim ke owner"}</Button>}
    </div>
    {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
  </div>;

  return <form action={action} className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Revisi baru dari versi {revision.revisionNumber}</h2>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <input type="hidden" name="expectedRevisionNumber" value={revision.revisionNumber} />
    <fieldset disabled={pending} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="content-title">Judul</Label><Input id="content-title" name="title" defaultValue={revision.title} required maxLength={200} /></div>
      {FIELDS.map(([key, label, max]) => <div key={key} className="space-y-2"><Label htmlFor={`content-${key}`}>{label}</Label><Textarea id={`content-${key}`} name={key} defaultValue={revision[key]} maxLength={max} /></div>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="content-format">Format</Label>
          <select id="content-format" name="format" className={agencySelectClass} defaultValue={revision.format}>
            {CONTENT_FORMATS.map((f) => <option key={f} value={f}>{CONTENT_FORMAT_LABELS[f]}</option>)}
          </select></div>
        <div className="space-y-2"><Label htmlFor="content-account">Akun / handle tujuan</Label><Input id="content-account" name="targetAccount" defaultValue={revision.targetAccount} maxLength={300} /></div>
      </div>
      <div className="space-y-2"><h3 className="text-sm font-medium">Media</h3>
        {!assets.length && <p className="text-sm text-muted-foreground">Unggah media di bagian Media, lalu pilih di sini.</p>}
        {assets.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="assetIds" value={a.id} defaultChecked={revision.assetIds.includes(a.id)} />{a.filename}</label>)}
      </div>
    </fieldset>
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" type="button" disabled={pending} onClick={() => setOpen(false)}>Batal</Button>
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan revisi baru"}</Button>
    </div>
  </form>;
}

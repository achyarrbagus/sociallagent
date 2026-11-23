"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideContentAction, type ActionState } from "@/lib/content/actions";
import { AssetPreview, type AssetView } from "./ContentMedia";
import { CONTENT_FORMAT_LABELS, type ContentDecisionValue, type ContentStatusValue } from "@/lib/content/schemas";

type Revision = {
  revisionNumber: number; title: string; idea: string; hook: string; caption: string; script: string; cta: string;
  format: keyof typeof CONTENT_FORMAT_LABELS; targetAccount: string;
};
type Decision = { id: string; decision: ContentDecisionValue; note: string | null; createdAt: Date };

const DECISION_LABELS: Record<ContentDecisionValue, string> = {
  select_idea: "Ide dipilih", approve: "Disetujui", request_changes: "Minta revisi", reject: "Ditolak",
};

export function ContentReview({ slug, content, preview, isCurrent, contextCurrent, canManage, decisions, assets }: {
  slug: string;
  content: { id: string; status: ContentStatusValue; revisionNumber: number };
  preview: Revision;
  isCurrent: boolean;
  contextCurrent: boolean;
  canManage: boolean;
  decisions: Decision[];
  assets: AssetView[];
}) {
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await decideContentAction(slug, content.id, prev, form);
    if (result.ok) setNote("");
    return result;
  }, { ok: false });
  const s = content.status;
  const decide = (decision: ContentDecisionValue, label: string, variant: "default" | "outline", disabled = false) =>
    <Button type="submit" name="decision" value={decision} variant={variant} disabled={pending || !isCurrent || disabled}>{label}</Button>;

  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">{preview.title}</h1><Badge variant="outline">Revisi {preview.revisionNumber}</Badge></div>
    {!isCurrent && <div className="space-y-2"><p role="status" className="text-sm text-muted-foreground">Kamu sedang melihat revisi lama. Review versi terbaru sebelum mengambil keputusan.</p><Button asChild variant="outline"><Link href={`/${slug}/content/${content.id}`}>Lihat revisi terbaru</Link></Button></div>}
    {!contextCurrent && <p role="status" className="text-sm text-destructive">Brand, klien, atau campaign berubah sejak revisi ini dibuat. Pulihkan konteks bila diarsipkan, lalu simpan revisi baru dengan panduan terbaru sebelum review.</p>}
    <p className="text-sm text-muted-foreground">{CONTENT_FORMAT_LABELS[preview.format]} · {preview.targetAccount || "Akun tujuan belum ditentukan"}</p>
    {([["Ide", preview.idea], ["Hook", preview.hook], ["Caption", preview.caption], ["Script", preview.script], ["CTA", preview.cta]] as const)
      .filter(([, value]) => value)
      .map(([title, value]) => <div key={title} className="space-y-1"><h2 className="text-sm font-medium">{title}</h2><p className="whitespace-pre-wrap break-words text-sm">{value}</p></div>)}
    {assets.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{assets.map((a) => <AssetPreview key={a.id} asset={a} />)}</div>}

    {canManage && <form action={action} className="space-y-3 border-t pt-4">
      <input type="hidden" name="expectedRevisionNumber" value={preview.revisionNumber} />
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="space-y-2"><Label htmlFor="content-review-note">Feedback owner</Label><Textarea id="content-review-note" name="note" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} disabled={pending} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["idea", "in_production", "awaiting_owner", "changes_requested"].includes(s) && decide("reject", "Tolak", "outline")}
          {["awaiting_owner", "approved"].includes(s) && decide("request_changes", "Minta revisi", "outline", !note.trim())}
        </div>
        {s === "idea" && decide("select_idea", "Pilih ide untuk produksi", "default")}
        {s === "awaiting_owner" && decide("approve", "Setujui konten", "default", !contextCurrent)}
      </div>
      <p className="text-sm text-muted-foreground">Memilih ide memulai produksi. Persetujuan berlaku untuk revisi ini saja dan tidak langsung mempublikasikan.</p>
    </form>}

    {decisions.length > 0 && <div className="space-y-2 border-t pt-4"><h2 className="text-sm font-medium">Keputusan owner untuk revisi ini</h2>
      {decisions.map((d) => <p key={d.id} className="whitespace-pre-wrap text-sm">{DECISION_LABELS[d.decision]} · {new Date(d.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}{d.note ? ` — ${d.note}` : ""}</p>)}
    </div>}
  </section>;
}

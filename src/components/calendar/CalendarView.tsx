"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelPublication, completePublication, type PublishState } from "@/lib/publications/actions";
import { PUBLICATION_PLATFORM_LABELS, PUBLICATION_STATUS_LABELS } from "@/lib/publications/schemas";
import { cn } from "@/lib/utils";

export type CalendarEntry = {
  id: string; day: string; when: string; time: string; contentId: string; title: string; brandName: string;
  platform: string; account: string | null; dispatch: "manual" | "connector"; status: keyof typeof PUBLICATION_STATUS_LABELS;
  approvalCurrent: boolean; postText: string; assets: { id: string; filename: string }[]; externalUrl: string | null; failureReason: string | null;
};

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const platformLabel = (p: string) => PUBLICATION_PLATFORM_LABELS[p as keyof typeof PUBLICATION_PLATFORM_LABELS] ?? p;
const needsAttention = (e: CalendarEntry) => e.status === "failed" || e.status === "unknown" || (e.status === "scheduled" && !e.approvalCurrent);
const statusText = (e: CalendarEntry) => e.status === "scheduled" && !e.approvalCurrent ? "Perlu persetujuan ulang" : PUBLICATION_STATUS_LABELS[e.status];

export function CalendarView({ slug, canManage, monthLabel, prev, next, days, today, entries }: {
  slug: string; canManage: boolean; monthLabel: string; prev: string; next: string;
  days: { key: string; date: number; inMonth: boolean }[]; today: string; entries: CalendarEntry[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Kalender</h1><p className="text-sm text-muted-foreground">Semua posting terjadwal, terbit, gagal, dan dibatalkan.</p></div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link href={`/${slug}/calendar?month=${prev}`} aria-label="Bulan sebelumnya"><ChevronLeft className="size-4" /></Link></Button>
        <span className="min-w-36 text-center font-medium capitalize">{monthLabel}</span>
        <Button asChild variant="outline" size="sm"><Link href={`/${slug}/calendar?month=${next}`} aria-label="Bulan berikutnya"><ChevronRight className="size-4" /></Link></Button>
        <Button asChild variant="ghost" size="sm"><Link href={`/${slug}/calendar`}>Hari ini</Link></Button>
      </div>
    </div>
    {selected && <PublicationPanel key={selected.id} slug={slug} entry={selected} canManage={canManage} onClose={() => setSelectedId(null)} />}
    {!entries.length && <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" />Belum ada posting bulan ini. Jadwalkan dari konten yang sudah disetujui.</p>}
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="grid min-w-[700px] grid-cols-7">
        {WEEKDAYS.map((d) => <div key={d} className="border-b bg-muted px-2 py-1 text-xs font-medium">{d}</div>)}
        {days.map((day) => <div key={day.key} className={cn("min-h-28 space-y-1 border-b border-r p-1", !day.inMonth && "bg-muted/40 text-muted-foreground")}>
          <div className={cn("w-fit rounded-full px-1.5 text-xs", day.key === today && "bg-[var(--sa-yellow)] font-semibold text-[var(--sa-ink)]")}>{day.date}</div>
          {(byDay.get(day.key) ?? []).map((e) => <button key={e.id} type="button" onClick={() => setSelectedId(e.id)}
            className={cn("block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-xs",
              needsAttention(e) ? "border-destructive text-destructive" : e.status === "published" ? "bg-[var(--sa-teal)] text-white" : "bg-[var(--sa-accent-soft)]",
              e.status === "cancelled" && "line-through opacity-60")}>
            {e.time} {platformLabel(e.platform)} · {e.title}
          </button>)}
        </div>)}
      </div>
    </div>
  </div>;
}

function PublicationPanel({ slug, entry, canManage, onClose }: { slug: string; entry: CalendarEntry; canManage: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [state, complete, completing] = useActionState<PublishState, FormData>(completePublication.bind(null, slug, entry.id), { ok: false });
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();
  const open = entry.status === "scheduled" || entry.status === "unknown";

  return <section aria-label="Detail posting" className="space-y-3 rounded-lg border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-base font-semibold">{entry.title}</h2>
        <p className="text-sm text-muted-foreground">{entry.brandName} · {platformLabel(entry.platform)}{entry.account ? ` · ${entry.account}` : ""} · {entry.when}</p></div>
      <div className="flex items-center gap-2"><Badge variant={needsAttention(entry) ? "destructive" : "secondary"}>{statusText(entry)}</Badge><Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button></div>
    </div>
    {entry.status === "scheduled" && !entry.approvalCurrent && <p role="alert" className="text-sm text-destructive">Konten berubah setelah dijadwalkan. Setujui revisi baru lalu jadwalkan ulang; posting ini tidak akan dikirim.</p>}
    {entry.status === "unknown" && <p role="alert" className="text-sm text-destructive">Platform mungkin sudah menerima posting ini, tapi konfirmasinya hilang. Cek akun sosialnya sebelum menandai terbit atau tidak. Retry otomatis dimatikan untuk mencegah posting ganda.</p>}
    <p className="text-xs text-muted-foreground">{entry.dispatch === "connector" ? "Dipublikasikan otomatis lewat akun yang terhubung." : "Kamu posting sendiri, lalu tandai di sini."}</p>
    {entry.postText && <div className="space-y-2">
      <pre className="whitespace-pre-wrap rounded-md border p-3 font-sans text-sm">{entry.postText}</pre>
      <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(entry.postText); setCopied(true); }}>{copied ? "Tersalin" : "Salin caption"}</Button>
    </div>}
    {entry.assets.length > 0 && <ul className="space-y-1 text-sm">{entry.assets.map((a) => <li key={a.id}><a className="underline" href={`/api/assets/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a></li>)}</ul>}
    {entry.externalUrl && <a className="text-sm underline" href={entry.externalUrl} target="_blank" rel="noreferrer">Lihat posting</a>}
    {entry.failureReason && <p className="text-sm text-destructive">{entry.failureReason}</p>}
    {canManage && open && <div className="space-y-2 border-t pt-3">
      <form action={complete} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-sm"><span className="font-medium">URL posting</span><Input name="externalUrl" placeholder="https://" /></label>
        <input type="hidden" name="failureReason" value="Ditandai tidak terbit oleh owner." />
        <Button type="submit" name="status" value="published" disabled={completing || (entry.status === "scheduled" && !entry.approvalCurrent)}>{entry.status === "unknown" ? "Konfirmasi terbit" : "Tandai terbit"}</Button>
        <Button type="submit" name="status" value="failed" variant="outline" disabled={completing}>{entry.status === "unknown" ? "Konfirmasi tidak terbit" : "Tidak terbit"}</Button>
        {entry.status === "scheduled" && <Button type="button" variant="ghost" disabled={cancelling} onClick={() => startCancel(async () => {
          const result = await cancelPublication(slug, entry.id);
          setCancelError(result.ok ? null : result.error ?? "Gagal membatalkan.");
        })}>Batalkan</Button>}
      </form>
      {(state.error || cancelError) && <p role="alert" className="text-sm text-destructive">{state.error ?? cancelError}</p>}
    </div>}
    <Link href={`/${slug}/content/${entry.contentId}`} className="text-sm underline">Buka konten</Link>
  </section>;
}

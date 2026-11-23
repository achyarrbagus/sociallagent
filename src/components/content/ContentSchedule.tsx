"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { schedulePublication, type PublishState } from "@/lib/publications/actions";
import { PUBLICATION_PLATFORMS, PUBLICATION_PLATFORM_LABELS, PUBLICATION_STATUS_LABELS } from "@/lib/publications/schemas";

type Account = { id: string; platform: string; displayName: string };
type Scheduled = { id: string; platform: string; accountLabel: string | null; when: string; status: keyof typeof PUBLICATION_STATUS_LABELS; dispatch: string; externalUrl: string | null; approvalCurrent: boolean };

function defaultLocal(timeZone: string) {
  const next = new Date(Date.now() + 60 * 60_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(next).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

export function ContentSchedule({ slug, contentId, revisionNumber, timezone, caption, accounts, scheduled }: {
  slug: string; contentId: string; revisionNumber: number; timezone: string; caption: string; accounts: Account[]; scheduled: Scheduled[];
}) {
  const [platform, setPlatform] = useState<string>("instagram");
  const [accountId, setAccountId] = useState("");
  const [state, action, pending] = useActionState<PublishState, FormData>(schedulePublication.bind(null, slug, contentId), { ok: false });
  const available = accounts.filter((a) => a.platform === platform);

  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="content-schedule-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="content-schedule-heading" className="text-lg font-semibold">Jadwal posting</h2>
      <Link href={`/${slug}/calendar`} className="text-sm underline">Buka kalender</Link>
    </div>
    <p className="text-sm text-muted-foreground">Menjadwalkan revisi {revisionNumber} yang disetujui. Revisi baru membatalkan persetujuannya. Posting otomatis memakai caption dan media yang disetujui persis apa adanya.</p>
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Platform</span>
          <select name="platform" className={agencySelectClass} value={platform} onChange={(e) => { setPlatform(e.target.value); setAccountId(""); }}>
            {PUBLICATION_PLATFORMS.map((p) => <option key={p} value={p}>{PUBLICATION_PLATFORM_LABELS[p]}</option>)}
          </select></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Siapa yang memposting</span>
          <select name="socialAccountId" className={agencySelectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Saya posting sendiri (manual)</option>
            {available.map((a) => <option key={a.id} value={a.id}>Otomatis via {a.displayName}</option>)}
          </select></label>
        {!accountId && <label className="space-y-1 text-sm"><span className="font-medium">Label akun (opsional)</span><Input name="accountLabel" placeholder="@brand" maxLength={200} /></label>}
        <label className="space-y-1 text-sm"><span className="font-medium">Tanggal &amp; jam ({timezone})</span><Input name="scheduledAt" type="datetime-local" required defaultValue={defaultLocal(timezone)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Teks posting (kosong = caption yang disetujui)</span>
          <textarea name="postText" className={`${agencySelectClass} min-h-20`} placeholder={caption.slice(0, 200)} maxLength={63206} /></label>
      </div>
      {!available.length && <p className="text-sm text-muted-foreground">Belum ada akun {PUBLICATION_PLATFORM_LABELS[platform as keyof typeof PUBLICATION_PLATFORM_LABELS]} yang terhubung untuk brand ini. Hubungkan di <Link href={`/${slug}/brands`} className="underline">Klien &amp; Brand</Link> untuk posting otomatis.</p>}
      {accountId && <p className="text-sm text-muted-foreground">Posting dikirim otomatis pada waktunya. Kalau respons platform tidak jelas, kalender akan meminta kamu mengecek akun alih-alih berisiko memposting dua kali.</p>}
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Menjadwalkan…" : "Jadwalkan"}</Button></div>
    </form>
    {scheduled.length > 0 && <ul className="divide-y divide-border rounded-md border border-border text-sm">{scheduled.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="font-medium">{PUBLICATION_PLATFORM_LABELS[p.platform as keyof typeof PUBLICATION_PLATFORM_LABELS] ?? p.platform}</span>
      {p.accountLabel && <span className="text-muted-foreground">{p.accountLabel}</span>}
      <span className="text-muted-foreground">{p.when}</span>
      <Badge variant={p.status === "failed" ? "destructive" : "secondary"}>{PUBLICATION_STATUS_LABELS[p.status]}</Badge>
      {p.dispatch === "connector" && <Badge variant="outline">Otomatis</Badge>}
      {p.status === "scheduled" && !p.approvalCurrent && <Badge variant="destructive">Perlu persetujuan ulang</Badge>}
      {p.externalUrl && <a className="underline" href={p.externalUrl} target="_blank" rel="noreferrer">Lihat posting</a>}
    </li>)}</ul>}
  </section>;
}

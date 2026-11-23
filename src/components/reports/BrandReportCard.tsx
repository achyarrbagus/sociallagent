"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CONTENT_STATUS_LABELS, type ContentStatusValue } from "@/lib/content/schemas";
import { PUBLICATION_PLATFORM_LABELS } from "@/lib/publications/schemas";
import type { BrandReport } from "@/lib/reports/brand-reports";

const platform = (p: string) => PUBLICATION_PLATFORM_LABELS[p as keyof typeof PUBLICATION_PLATFORM_LABELS] ?? p;
const fmt = (n: number) => n.toLocaleString("id-ID");

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}

/** Plain-text summary an account manager can paste to the client. */
function summaryText(r: BrandReport, period: string) {
  const platforms = Object.entries(r.publishedByPlatform).map(([p, n]) => `${platform(p)} ${n}`).join(", ");
  return [
    `${r.brandName} (${r.clientName}) — ${period}`,
    `Konten disetujui: ${r.approvedInPeriod}`,
    `Posting terbit: ${r.posts.published}${platforms ? ` (${platforms})` : ""}; terjadwal: ${r.posts.scheduled}; gagal: ${r.posts.failed}`,
    ...r.recentPosts.filter((p) => p.externalUrl).map((p) => `- ${p.title} di ${platform(p.platform)}: ${p.externalUrl}`),
  ].join("\n");
}

export function BrandReportCard({ report, period }: { report: BrandReport; period: string }) {
  const [copied, setCopied] = useState(false);
  const s = report.contentByStatus;
  const inProgress = (s.idea ?? 0) + (s.in_production ?? 0) + (s.awaiting_owner ?? 0) + (s.changes_requested ?? 0);
  return <section className="space-y-4 rounded-lg border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-base font-semibold">{report.brandName}</h2><p className="text-sm text-muted-foreground">{report.clientName}</p></div>
      <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(summaryText(report, period)); setCopied(true); }}>{copied ? "Tersalin" : "Salin ringkasan untuk klien"}</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat label="Disetujui periode ini" value={report.approvedInPeriod} />
      <Stat label="Posting terbit" value={report.posts.published} />
      <Stat label="Terjadwal / gagal" value={`${report.posts.scheduled} / ${report.posts.failed}`} />
      <Stat label="Pemakaian AI" value={`${report.aiTasks} tugas · ${fmt(report.aiTokens)} token`} />
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>Sedang berjalan: {inProgress}</span>
      {Object.entries(s).map(([status, n]) => <span key={status}>{CONTENT_STATUS_LABELS[status as ContentStatusValue]}: {n}</span>)}
    </div>
    {Object.keys(report.publishedByPlatform).length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {Object.entries(report.publishedByPlatform).map(([p, n]) => <span key={p}>{platform(p)}: {n}</span>)}
    </div>}
    {report.recentPosts.length > 0 && <ul className="divide-y divide-border rounded-md border text-sm">{report.recentPosts.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="font-medium">{p.title}</span><span className="text-muted-foreground">{platform(p.platform)}</span>
      {p.publishedAt && <span className="text-muted-foreground">{new Date(p.publishedAt).toLocaleDateString("id-ID")}</span>}
      {p.externalUrl && <a className="underline" href={p.externalUrl} target="_blank" rel="noreferrer">Lihat posting</a>}
    </li>)}</ul>}
  </section>;
}

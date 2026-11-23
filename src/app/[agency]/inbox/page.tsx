import Link from "next/link";
import { AlertTriangle, CheckCheck, ClipboardCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inboxItems } from "@/lib/inbox";
import { PUBLICATION_PLATFORM_LABELS, PUBLICATION_STATUS_LABELS } from "@/lib/publications/schemas";
import { formatInZone } from "@/lib/publications/timezone";
import { PRODUCTION_ROLE_LABELS } from "@/lib/content/schemas";
import { requireAgency } from "@/lib/session";

const platform = (p: string) => PUBLICATION_PLATFORM_LABELS[p as keyof typeof PUBLICATION_PLATFORM_LABELS] ?? p;

/** One queue for everything that is waiting on the owner. */
export default async function InboxPage({ params }: PageProps<"/[agency]/inbox">) {
  const { agency: slug } = await params;
  const { agency } = await requireAgency(slug);
  const { review, posts, tasks } = await inboxItems(agency.id);
  const empty = !review.length && !posts.length && !tasks.length;
  const row = "flex flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-accent/40";

  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">Inbox</h1><p className="text-sm text-muted-foreground">Semua yang menunggu keputusan kamu.</p></div>
    {empty && <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><CheckCheck className="size-8" aria-hidden="true" />Semua sudah tertangani.</div>}

    {review.length > 0 && <section className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4" aria-hidden="true" />Menunggu review ({review.length})</h2>
      <ul className="divide-y rounded-lg border bg-card">{review.map((c) => <li key={c.id}><Link href={`/${slug}/content/${c.id}`} className={row}>
        <span className="flex-1 font-medium">{c.title}</span><span className="text-muted-foreground">{c.brand.name} · Revisi {c.revisionNumber}</span><Badge className="border border-border bg-[var(--sa-yellow)] text-[var(--sa-ink)]">Review</Badge>
      </Link></li>)}</ul></section>}

    {posts.length > 0 && <section className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden="true" />Posting perlu dicek ({posts.length})</h2>
      <ul className="divide-y rounded-lg border bg-card">{posts.map((p) => <li key={p.id}><Link href={`/${slug}/calendar?month=${p.scheduledAt.toISOString().slice(0, 7)}`} className={row}>
        <span className="flex-1 font-medium">{p.content.title}</span>
        <span className="text-muted-foreground">{platform(p.platform)} · {formatInZone(p.scheduledAt, p.timezone)}</span>
        <Badge variant="destructive">{p.status === "scheduled" ? "Perlu persetujuan ulang" : PUBLICATION_STATUS_LABELS[p.status]}</Badge>
        {p.failureReason && <span className="w-full text-xs text-destructive">{p.failureReason}</span>}
      </Link></li>)}</ul></section>}

    {tasks.length > 0 && <section className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><XCircle className="size-4" aria-hidden="true" />Tugas agent gagal 7 hari terakhir ({tasks.length})</h2>
      <ul className="divide-y rounded-lg border bg-card">{tasks.map((t) => <li key={t.id}><Link href={`/${slug}/content/${t.contentId}`} className={row}>
        <span className="flex-1 font-medium">{t.content.title}</span><span className="text-muted-foreground">{t.agent.name} · {PRODUCTION_ROLE_LABELS[t.role]}</span>
        {t.error && <span className="w-full text-xs text-destructive">{t.error}</span>}
      </Link></li>)}</ul></section>}
  </div>;
}

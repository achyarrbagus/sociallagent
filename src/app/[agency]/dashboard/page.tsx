import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bot, CalendarDays, CheckCheck, ClipboardCheck, FolderKanban, History, Plus, Sparkles } from "lucide-react";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/agency/schemas";
import { prisma } from "@/lib/prisma";
import { PUBLICATION_PLATFORM_LABELS } from "@/lib/publications/schemas";
import { formatInZone } from "@/lib/publications/timezone";
import { requireAgency } from "@/lib/session";

const ACTIVE_STATUSES = ["planned", "in_progress"] as const;

export default async function DashboardPage({ params }: PageProps<"/[agency]/dashboard">) {
  const { agency: slug } = await params;
  const { agency } = await requireAgency(slug);
  const where = { organizationId: agency.id };
  const { now: start, weekAhead } = weekWindow();
  const [review, upcoming, agents, campaigns, activity] = await Promise.all([
    prisma.content.findMany({
      where: { ...where, status: "awaiting_owner" },
      include: { brand: true },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.publication.findMany({
      where: { ...where, status: "scheduled", scheduledAt: { gte: start, lt: weekAhead } },
      include: { content: { include: { brand: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.agent.findMany({ where, select: { status: true } }),
    prisma.campaign.findMany({
      where: { ...where, status: { in: [...ACTIVE_STATUSES] } },
      include: { brand: true },
      orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const now = new Date();
  const running = agents.filter((a) => a.status === "running").length;
  const ready = agents.filter((a) => a.status !== "paused").length;
  const href = (path: string) => `/${slug}${path}`;

  return <div className="today-canvas">
    <div className="today-workspace">
      <header className="today-header">
        <div className="today-brand"><span className="today-brand-mark" aria-hidden="true"><Sparkles /></span><span>SocialAgent <span className="today-brand-divider">/</span> <span className="today-workspace-name">{agency.name}</span></span></div>
        <Link href={href("/campaigns")} className="today-button"><span className="today-plus"><Plus aria-hidden="true" /></span>Buat campaign</Link>
      </header>

      <div className="today-heading">
        <div><p className="today-eyebrow">Ruang kerja agensi</p><h1>Hari ini<span className="today-heading-dot">.</span></h1><p>Ide bergerak. Konten terbit. Brand bertumbuh.</p></div>
        <div className="today-date"><CalendarDays aria-hidden="true" /><time dateTime={now.toLocaleDateString("en-CA")}>{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}</time></div>
      </div>

      {!agents.length && <div className="today-notices"><p className="today-panel-caption">Agensi kamu belum punya tim AI. <Link href={`/onboarding?agency=${slug}`} className="today-text-link">Siapkan tim <ArrowUpRight aria-hidden="true" /></Link></p></div>}

      <section aria-label="Ringkasan agensi" className="today-metrics">
        <Link href={href("/content?status=awaiting_owner")} className="today-metric today-metric-blue"><div className="today-metric-top"><span>Menunggu review</span><ClipboardCheck aria-hidden="true" /></div><div className="today-metric-value">{review.length}<ArrowUpRight aria-hidden="true" /></div><p>Konten yang menunggu keputusan owner</p></Link>
        <Link href={href("/calendar")} className="today-metric today-metric-yellow"><div className="today-metric-top"><span>Jadwal 7 hari</span><CalendarDays aria-hidden="true" /></div><div className="today-metric-value">{upcoming.length}<ArrowUpRight aria-hidden="true" /></div><p>Posting terjadwal mulai hari ini</p></Link>
        <Link href={href("/campaigns")} className="today-metric today-metric-teal"><div className="today-metric-top"><span>Campaign aktif</span><FolderKanban aria-hidden="true" /></div><div className="today-metric-value">{campaigns.length}<ArrowUpRight aria-hidden="true" /></div><p>Campaign dalam rencana &amp; produksi</p></Link>
      </section>

      <div className="today-main-grid">
        <section className="today-panel" aria-labelledby="today-review-heading">
          <div className="today-panel-heading"><div><p className="today-eyebrow">Giliran kamu</p><h2 id="today-review-heading">Perlu perhatian <ArrowDownRight aria-hidden="true" /></h2></div><Link href={href("/content")} className="today-small-button">Buka konten <ArrowUpRight aria-hidden="true" /></Link></div>
          {!review.length ? <div className="today-empty"><span className="today-empty-icon"><CheckCheck aria-hidden="true" /></span><h3>Semua sudah tertangani</h3><p>Konten yang diajukan untuk review akan muncul di sini.</p><Link href={href("/content")} className="today-text-link">Buka studio konten <ArrowUpRight aria-hidden="true" /></Link></div> :
            <ul className="today-list">{review.slice(0, 5).map((item) => <li key={item.id}><Link href={href(`/content/${item.id}`)} className="today-review-row"><span className="today-content-icon" aria-hidden="true"><ClipboardCheck /></span><span className="today-row-copy"><strong>{item.title}</strong><span>{item.brand.name} · Revisi {item.revisionNumber}</span></span><span className="today-badge today-badge-yellow">Review</span><ArrowUpRight className="today-row-arrow" aria-hidden="true" /></Link></li>)}</ul>}
          {review.length > 5 && <Link href={href("/content?status=awaiting_owner")} className="today-panel-footer">Lihat antrean review selengkapnya <ArrowUpRight aria-hidden="true" /></Link>}
        </section>

        <section className="today-panel" aria-labelledby="today-schedule-heading">
          <div className="today-panel-heading"><div><p className="today-eyebrow">Siap tayang</p><h2 id="today-schedule-heading">Jadwal terdekat</h2></div><Link href={href("/calendar")} className="today-icon-link" aria-label="Buka kalender publikasi"><ArrowUpRight aria-hidden="true" /></Link></div>
          <p className="today-panel-caption">7 hari mulai hari ini · zona waktu brand</p>
          {!upcoming.length ? <div className="today-empty"><span className="today-empty-icon"><CalendarDays aria-hidden="true" /></span><h3>Kalender masih lapang</h3><p>Jadwalkan konten yang sudah disetujui agar siap tayang.</p><Link href={href("/calendar")} className="today-text-link">Buka kalender <ArrowUpRight aria-hidden="true" /></Link></div> :
            <ul className="today-list">{upcoming.slice(0, 4).map((post) => {
              const current = post.content.status === "approved" && post.content.approvedRevisionNumber === post.revisionNumber;
              return <li key={post.id}><Link href={href(`/content/${post.contentId}`)} className="today-schedule-row"><span className="today-day"><strong>{formatInZone(post.scheduledAt, post.timezone, { day: "numeric" })}</strong><span>{formatInZone(post.scheduledAt, post.timezone, { month: "short" })}</span></span><span className="today-row-copy"><strong>{post.content.title}</strong><span>{post.content.brand.name} · {PUBLICATION_PLATFORM_LABELS[post.platform as keyof typeof PUBLICATION_PLATFORM_LABELS] ?? post.platform}</span><time dateTime={post.scheduledAt.toISOString()}>{formatInZone(post.scheduledAt, post.timezone, { hour: "2-digit", minute: "2-digit" })}{!current && " · Perlu persetujuan ulang"}</time></span></Link></li>;
            })}</ul>}
        </section>
      </div>

      <section className="today-panel" aria-labelledby="today-campaign-heading">
        <div className="today-panel-heading"><div><p className="today-eyebrow">Dari brief ke hasil</p><h2 id="today-campaign-heading">Campaign aktif</h2></div><Link href={href("/campaigns")} className="today-small-button">Kelola campaign <ArrowUpRight aria-hidden="true" /></Link></div>
        {!campaigns.length ? <div className="today-empty"><span className="today-empty-icon"><FolderKanban aria-hidden="true" /></span><h3>Campaign berikutnya dimulai di sini</h3><p>Tambahkan klien dan brand, lalu buat campaign pertama.</p><Link href={href("/brands")} className="today-text-link">Kelola brand &amp; campaign <ArrowUpRight aria-hidden="true" /></Link></div> :
          <div className="today-table-scroll"><table className="today-table"><caption className="sr-only">Campaign brand aktif</caption><thead><tr><th scope="col">Campaign / Brand</th><th scope="col">Target selesai</th><th scope="col">Status</th></tr></thead><tbody>
            {campaigns.slice(0, 8).map((c) => <tr key={c.id}>
              <td><Link href={href(`/campaigns/${c.id}`)} className="today-campaign-name">{c.name}<ArrowUpRight aria-hidden="true" /></Link><span className="today-secondary">{c.brand.name}</span></td>
              <td>{c.targetDate ? c.targetDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Belum ditentukan"}</td>
              <td><span className={`today-badge ${c.status === "in_progress" ? "today-badge-teal" : "today-badge-blue"}`}>{CAMPAIGN_STATUS_LABELS[c.status]}</span></td>
            </tr>)}
          </tbody></table></div>}
      </section>

      <section className="today-panel" aria-labelledby="today-activity-heading">
          <div className="today-panel-heading"><div><p className="today-eyebrow">Jejak kerja</p><h2 id="today-activity-heading">Aktivitas terbaru</h2></div></div>
          {!activity.length ? <div className="today-empty"><span className="today-empty-icon"><History aria-hidden="true" /></span><h3>Belum ada aktivitas</h3><p>Perubahan pada klien, brand, campaign, dan konten akan tercatat di sini.</p></div> :
            <ul className="today-list">{activity.map((a) => <li key={a.id} className="today-review-row"><span className="today-content-icon" aria-hidden="true"><History /></span><span className="today-row-copy"><strong>{a.summary}</strong><span>{a.createdAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</span></span></li>)}</ul>}
        </section>

      <footer className="today-team"><span><Bot aria-hidden="true" /><strong>Tim AI</strong>{agents.length ? `${ready} siap bekerja · ${running} sedang berjalan` : "Belum ada tim"}</span><Link href={href("/team")} className="today-text-link">Lihat tim <ArrowUpRight aria-hidden="true" /></Link></footer>
    </div>
  </div>;
}

/** Request-time window for "next 7 days". */
function weekWindow() {
  const now = new Date();
  return { now, weekAhead: new Date(now.getTime() + 7 * 86_400_000) };
}

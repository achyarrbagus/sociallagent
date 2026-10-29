import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Bot, CalendarDays, CheckCheck, ClipboardCheck, FolderKanban, Plus, Search, Sparkles } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { Link, useActiveCompanyPrefix } from "@/lib/router";
import { agencyApi } from "../api/agency";
import { agencyContentApi } from "../api/agency-content";
import { agencyPublicationsApi, PLATFORM_LABELS } from "../api/agency-publications";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { activeCampaigns, campaignProgress, scheduledPublications, todayRange } from "../lib/today-overview";
import { useDialogActions } from "../context/DialogContext";

function DataMessage({ loading, error, empty, onRetry, children }: {
  loading: boolean; error: Error | null; empty: boolean; onRetry: () => void; children: ReactNode;
}) {
  if (loading) return <p role="status" className="today-empty">Memuat data…</p>;
  if (error) return <div role="alert" className="today-empty"><p>Data belum bisa dimuat. {error.message}</p><button type="button" className="today-text-link" onClick={onRetry}>Coba lagi</button></div>;
  return empty ? <div className="today-empty">{children}</div> : null;
}

export function TodayOverview({ companyId, companyName, agents, agentsError, notices, children }: {
  companyId: string; companyName: string; agents: Agent[] | undefined; agentsError: Error | null; notices: ReactNode; children?: ReactNode;
}) {
  const { openNewIssue } = useDialogActions();
  const companyPrefix = useActiveCompanyPrefix();
  const agencyHref = (path: string) => companyPrefix ? `/${companyPrefix}${path}` : path;
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const range = useMemo(() => todayRange(new Date(day)), [day]);
  const review = useQuery({ queryKey: ["agency-content", companyId, "today-review"], queryFn: () => agencyContentApi.list(companyId, { status: "awaiting_owner" }) });
  const posts = useQuery({ queryKey: ["agency-publications", companyId, "today", range], queryFn: () => agencyPublicationsApi.list(companyId, range) });
  const projects = useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () => projectsApi.list(companyId) });
  const directory = useQuery({ queryKey: queryKeys.agency(companyId), queryFn: () => agencyApi.directory(companyId) });
  const campaigns = activeCampaigns(projects.data ?? []);
  const scheduled = scheduledPublications(posts.data ?? [], range);
  const matches = (value: string) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const reviewItems = (review.data?.items ?? []).filter(item => matches(item.title));
  const visibleCampaigns = campaigns.filter(project => matches(project.name));
  const campaignTasks = useQueries({ queries: visibleCampaigns.slice(0, 6).map(project => ({
    queryKey: [...queryKeys.issues.list(companyId), "today-campaign-all", project.id],
    queryFn: () => issuesApi.listAll(companyId, { projectId: project.id, includeAgentCreatedTasks: true, includeRoutineExecutions: true }),
  })) });
  const brandName = (brandId: string) => directory.data?.brands.find(brand => brand.id === brandId)?.name ?? "Brand";
  const running = agents?.filter(agent => agent.status === "running").length ?? 0;
  const ready = agents?.filter(agent => ["active", "idle", "running"].includes(agent.status)).length ?? 0;
  const reviewValue = review.isError ? "—" : review.isPending ? "…" : `${review.data.items.length}${review.data.nextCursor ? "+" : ""}`;

  return <div className="today-canvas">
    <div className="today-workspace">
      <header className="today-header">
        <div className="today-brand"><span className="today-brand-mark" aria-hidden="true"><Sparkles /></span><span>SocialAgent <span className="today-brand-divider">/</span> <span className="today-workspace-name">{companyName}</span></span></div>
        <button type="button" className="today-button" onClick={() => openNewIssue()}><span className="today-plus"><Plus aria-hidden="true" /></span>Buat brief</button>
      </header>

      <div className="today-heading">
        <div><p className="today-eyebrow">Ruang kerja agensi</p><h1>Hari ini<span className="today-heading-dot">.</span></h1><p>Ide bergerak. Konten terbit. Brand bertumbuh.</p></div>
        <div className="today-date"><CalendarDays aria-hidden="true" /><time dateTime={now.toLocaleDateString("en-CA")}>{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time></div>
      </div>

      <div className="today-toolbar">
        <nav aria-label="Navigasi ringkasan agensi" className="today-tabs"><Link to="/dashboard" aria-current="page" className="today-tab today-tab-active">Ringkasan</Link><Link to={agencyHref("/content")} className="today-tab">Konten</Link><Link to={agencyHref("/calendar")} className="today-tab">Kalender</Link><Link to={agencyHref("/reports")} className="today-tab">Laporan</Link></nav>
        <label className="today-search"><span className="sr-only">Cari judul review atau campaign di ringkasan ini</span><input type="search" placeholder="Cari review atau campaign…" value={search} onChange={event => setSearch(event.target.value)} /><Search aria-hidden="true" /></label>
      </div>

      {notices && <div className="today-notices">{notices}</div>}

      <section aria-label="Ringkasan pekerjaan agensi" className="today-metrics">
        <Link to={agencyHref("/content")} className="today-metric today-metric-blue"><div className="today-metric-top"><span>Menunggu review</span><ClipboardCheck aria-hidden="true" /></div><div className="today-metric-value">{reviewValue}<ArrowUpRight aria-hidden="true" /></div><p>{review.isError ? "Data review belum tersedia" : review.data?.nextCursor ? "Konten pada halaman pertama · masih ada lagi" : "Konten yang menunggu keputusan owner"}</p></Link>
        <Link to={agencyHref("/calendar")} className="today-metric today-metric-yellow"><div className="today-metric-top"><span>Jadwal 7 hari</span><CalendarDays aria-hidden="true" /></div><div className="today-metric-value">{posts.isError ? "—" : posts.isPending ? "…" : scheduled.length}<ArrowUpRight aria-hidden="true" /></div><p>Posting terjadwal mulai hari ini</p></Link>
        <Link to={agencyHref("/agency")} className="today-metric today-metric-teal"><div className="today-metric-top"><span>Campaign aktif</span><FolderKanban aria-hidden="true" /></div><div className="today-metric-value">{projects.isError ? "—" : projects.isPending ? "…" : campaigns.length}<ArrowUpRight aria-hidden="true" /></div><p>Campaign brand dalam rencana & produksi</p></Link>
      </section>

      <div className="today-main-grid">
        <section className="today-panel" aria-labelledby="today-review-heading">
          <div className="today-panel-heading"><div><p className="today-eyebrow">Giliran kamu</p><h2 id="today-review-heading">Perlu perhatian <ArrowDownRight aria-hidden="true" /></h2></div><Link to={agencyHref("/content")} className="today-small-button">Buka konten <ArrowUpRight aria-hidden="true" /></Link></div>
          <DataMessage loading={review.isPending} error={review.error} empty={!reviewItems.length} onRetry={() => void review.refetch()}><span className="today-empty-icon"><CheckCheck aria-hidden="true" /></span><h3>{search ? "Tidak ada review yang cocok" : "Semua sudah tertangani"}</h3><p>{search ? "Coba kata kunci lain atau hapus pencarian." : "Konten yang diajukan untuk review akan muncul di sini."}</p><Link to={agencyHref("/content")} className="today-text-link">Buka studio konten <ArrowUpRight aria-hidden="true" /></Link></DataMessage>
          {!review.isError && <ul className="today-list">{reviewItems.slice(0, 5).map(item => <li key={item.id}><Link to={agencyHref(`/content/${item.id}`)} className="today-review-row"><span className="today-content-icon" aria-hidden="true"><ClipboardCheck /></span><span className="today-row-copy"><strong>{item.title}</strong><span>{brandName(item.brandId)} · Revisi {item.revisionNumber}</span></span><span className="today-badge today-badge-yellow">Review</span><ArrowUpRight className="today-row-arrow" aria-hidden="true" /></Link></li>)}</ul>}
          {review.data && (review.data.items.length > 5 || review.data.nextCursor) && <Link to={agencyHref("/content")} className="today-panel-footer">Lihat antrean review selengkapnya <ArrowUpRight aria-hidden="true" /></Link>}
        </section>

        <section className="today-panel" aria-labelledby="today-schedule-heading">
          <div className="today-panel-heading"><div><p className="today-eyebrow">Siap tayang</p><h2 id="today-schedule-heading">Jadwal terdekat</h2></div><Link to={agencyHref("/calendar")} className="today-icon-link" aria-label="Buka kalender publikasi"><ArrowUpRight aria-hidden="true" /></Link></div>
          <p className="today-panel-caption">7 hari mulai hari ini · zona waktu perangkat</p>
          <DataMessage loading={posts.isPending} error={posts.error} empty={!scheduled.length} onRetry={() => void posts.refetch()}><span className="today-empty-icon"><CalendarDays aria-hidden="true" /></span><h3>Kalender masih lapang</h3><p>Jadwalkan konten yang sudah disetujui agar siap tayang.</p><Link to={agencyHref("/calendar")} className="today-text-link">Buka kalender <ArrowUpRight aria-hidden="true" /></Link></DataMessage>
          {!posts.isError && <ul className="today-list">{scheduled.slice(0, 4).map(post => <li key={post.id}><Link to={agencyHref(`/content/${post.contentId}`)} className="today-schedule-row"><span className="today-day"><strong>{new Date(post.scheduledAt).getDate()}</strong><span>{new Date(post.scheduledAt).toLocaleDateString("id-ID", { month: "short" })}</span></span><span className="today-row-copy"><strong>{post.contentTitle}</strong><span>{post.brandName} · {PLATFORM_LABELS[post.platform]}</span><time dateTime={post.scheduledAt}>{new Date(post.scheduledAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}{!post.approvalCurrent && " · Perlu persetujuan ulang"}</time></span></Link></li>)}</ul>}
        </section>
      </div>

      <section className="today-panel" aria-labelledby="today-campaign-heading">
        <div className="today-panel-heading"><div><p className="today-eyebrow">Dari brief ke hasil</p><h2 id="today-campaign-heading">Campaign aktif</h2></div><Link to={agencyHref("/agency")} className="today-small-button">Kelola campaign <ArrowUpRight aria-hidden="true" /></Link></div>
        <DataMessage loading={projects.isPending} error={projects.error} empty={!visibleCampaigns.length} onRetry={() => void projects.refetch()}><span className="today-empty-icon"><FolderKanban aria-hidden="true" /></span><h3>{search ? "Tidak ada campaign yang cocok" : "Campaign berikutnya dimulai di sini"}</h3><p>{search ? "Coba kata kunci lain atau hapus pencarian." : "Hubungkan campaign dengan brand untuk melihat perkembangannya."}</p><Link to={agencyHref("/agency")} className="today-text-link">Kelola brand & campaign <ArrowUpRight aria-hidden="true" /></Link></DataMessage>
        {!projects.isError && visibleCampaigns.length > 0 && <div className="today-table-scroll"><table className="today-table"><caption className="sr-only">Campaign brand aktif dan progres tugas yang dapat kamu akses</caption><thead><tr><th scope="col">Campaign / Brand</th><th scope="col">Target selesai</th><th scope="col">Status</th><th scope="col">Progres tugas</th></tr></thead><tbody>{visibleCampaigns.slice(0, 6).map((project, index) => { const tasks = campaignTasks[index]; const progress = campaignProgress(project.id, tasks.data ?? []); return <tr key={project.id}><td><Link to={`/projects/${project.id}`} className="today-campaign-name">{project.name}<ArrowUpRight aria-hidden="true" /></Link><span className="today-secondary">{brandName(project.brandId!)}</span></td><td>{project.targetDate ? new Date(project.targetDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Belum ditentukan"}</td><td><span className={`today-badge ${project.status === "in_progress" ? "today-badge-teal" : "today-badge-blue"}`}>{project.status === "in_progress" ? "Produksi" : "Direncanakan"}</span></td><td>{tasks.isPending ? "Memuat…" : tasks.isError ? "Belum tersedia" : progress.total ? <div className="today-progress"><progress value={progress.completed} max={progress.total} aria-label={`Progres ${project.name}: ${progress.completed} dari ${progress.total} tugas selesai`} /><span>{progress.percent}%</span></div> : "Belum ada tugas"}</td></tr>; })}</tbody></table></div>}
        {campaignTasks.some(query => query.isError) && <p role="alert" className="today-panel-caption">Sebagian progres tugas belum tersedia. <button type="button" onClick={() => campaignTasks.filter(query => query.isError).forEach(query => void query.refetch())} className="today-text-link">Coba lagi</button></p>}
        {visibleCampaigns.length > 6 && <Link to={agencyHref("/agency")} className="today-panel-footer">Lihat semua campaign <ArrowUpRight aria-hidden="true" /></Link>}
      </section>
      {directory.error && <p role="alert" className="today-panel-caption">Nama brand belum bisa dimuat. <button type="button" className="today-text-link" onClick={() => void directory.refetch()}>Coba lagi</button></p>}
      <footer className="today-team"><span><Bot aria-hidden="true" /><strong>Tim AI</strong>{agentsError ? "Status tim belum tersedia" : !agents ? "Memuat status tim…" : `${ready} siap bekerja · ${running} sedang berjalan`}</span><Link to="/agents" className="today-text-link">Lihat tim <ArrowUpRight aria-hidden="true" /></Link></footer>
      {children}
    </div>
  </div>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentEditor } from "@/components/content/ContentEditor";
import { AssetPreview, ContentMediaUpload } from "@/components/content/ContentMedia";
import { ContentSchedule } from "@/components/content/ContentSchedule";
import { formatInZone } from "@/lib/publications/timezone";
import { ContentReview } from "@/components/content/ContentReview";
import { ContentTasks } from "@/components/content/ContentTasks";
import { StatusBadge } from "@/components/content/StatusBadge";
import { displayStatus, isApprovalValid, loadContent } from "@/lib/content/lifecycle";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

export default async function ContentDetailPage({ params, searchParams }: PageProps<"/[agency]/content/[contentId]">) {
  const { agency: slug, contentId } = await params;
  const { rev } = await searchParams;
  const { agency, canManage } = await requireAgency(slug);
  const loaded = await loadContent(agency.id, contentId);
  if (!loaded) notFound();
  const { content, revision: current, contextCurrent } = loaded;

  const wanted = typeof rev === "string" ? Number.parseInt(rev, 10) : NaN;
  const [preview, history, tasks, agents, assets, publications, accounts] = await Promise.all([
    Number.isInteger(wanted) && wanted !== current.revisionNumber
      ? prisma.contentRevision.findUnique({ where: { contentId_revisionNumber: { contentId, revisionNumber: wanted } } })
      : current,
    prisma.contentRevision.findMany({ where: { contentId }, select: { revisionNumber: true, createdByType: true, createdAt: true }, orderBy: { revisionNumber: "desc" } }),
    prisma.contentTask.findMany({ where: { contentId }, include: { agent: true }, orderBy: { createdAt: "desc" } }),
    prisma.agent.findMany({ where: { organizationId: agency.id }, orderBy: { createdAt: "asc" } }),
    prisma.contentAsset.findMany({ where: { contentId }, select: { id: true, filename: true, contentType: true, byteSize: true }, orderBy: { createdAt: "asc" } }),
    prisma.publication.findMany({ where: { contentId }, orderBy: { scheduledAt: "asc" } }),
    prisma.socialAccount.findMany({ where: { brandId: content.brandId, status: "active" }, select: { id: true, platform: true, displayName: true } }),
  ]);
  if (!preview) notFound();
  const decisions = await prisma.contentDecision.findMany({ where: { contentId, revisionNumber: preview.revisionNumber }, orderBy: { createdAt: "asc" } });
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));
  const status = displayStatus(content, contextCurrent);
  const isCurrent = preview.revisionNumber === current.revisionNumber;
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const previewAssets = preview.assetIds.flatMap((id) => assetById.get(id) ?? []);
  const approvalValid = isApprovalValid(content, contextCurrent);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/${slug}/content`} className="underline-offset-4 hover:underline">Konten</Link> / {content.brand.name} / {content.campaign.name}
      </nav>
      <StatusBadge status={status} />
    </div>
    <ContentReview
      slug={slug}
      content={{ id: content.id, status: content.status, revisionNumber: content.revisionNumber }}
      preview={preview}
      isCurrent={isCurrent}
      contextCurrent={contextCurrent}
      canManage={canManage}
      decisions={decisions}
      assets={previewAssets}
    />
    {canManage && isCurrent && <ContentEditor slug={slug} contentId={content.id} status={content.status} revision={current} contextCurrent={contextCurrent} assets={assets} />}
    {(canManage || assets.length > 0) && <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Media</h2>
      {assets.length > 0 ? <div className="grid gap-3 sm:grid-cols-3">{assets.map((a) => <AssetPreview key={a.id} asset={a} />)}</div> : <p className="text-sm text-muted-foreground">Belum ada media.</p>}
      {canManage && <ContentMediaUpload slug={slug} contentId={content.id} />}
    </section>}
    {(canManage && approvalValid || publications.length > 0) && (canManage && approvalValid
      ? <ContentSchedule slug={slug} contentId={content.id} revisionNumber={current.revisionNumber} timezone={content.brand.timezone} caption={current.caption} accounts={accounts}
          scheduled={publications.map((p) => ({ id: p.id, platform: p.platform, accountLabel: p.accountLabel, when: formatInZone(p.scheduledAt, p.timezone), status: p.status, dispatch: p.dispatch, externalUrl: p.externalUrl, approvalCurrent: approvalValid && content.approvedRevisionNumber === p.revisionNumber }))} />
      : <section className="space-y-2 rounded-lg border bg-card p-4"><h2 className="text-lg font-semibold">Jadwal posting</h2><p className="text-sm text-muted-foreground">{publications.length} posting tercatat. Lihat di <Link href={`/${slug}/calendar`} className="underline">kalender</Link>.</p></section>)}
    <ContentTasks
      slug={slug}
      contentId={content.id}
      canManage={canManage && !["approved", "rejected"].includes(content.status)}
      agents={agents.filter((a) => a.status !== "paused").map(({ id, name, title }) => ({ id, name, title }))}
      tasks={tasks.map((t) => ({
        id: t.id, role: t.role, status: t.status, agentName: t.agent.name, summary: t.summary, error: t.error,
        resultRevisionNumber: t.resultRevisionNumber, createdAt: t.createdAt.toISOString(),
      }))}
    />
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Riwayat revisi</h2>
      <div className="flex flex-wrap gap-2">{history.map((r) => {
        const active = r.revisionNumber === preview.revisionNumber;
        const href = r.revisionNumber === current.revisionNumber ? `/${slug}/content/${contentId}` : `/${slug}/content/${contentId}?rev=${r.revisionNumber}`;
        return <Link key={r.revisionNumber} href={href} aria-current={active ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${active ? "bg-[var(--sa-yellow)] text-[var(--sa-ink)]" : "bg-card hover:bg-accent"}`}>
          Revisi {r.revisionNumber}{r.createdByType === "agent" ? " · AI" : ""}
        </Link>;
      })}</div>
      <p className="text-xs text-muted-foreground">Revisi {preview.revisionNumber} ditulis oleh {preview.createdByType === "agent" ? agentNames.get(preview.createdById) ?? "agent" : "owner"} · {preview.createdAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</p>
    </section>
  </div>;
}

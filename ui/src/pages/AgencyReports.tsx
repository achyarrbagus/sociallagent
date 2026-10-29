import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { AgencyBrandReport } from "@paperclipai/shared";
import { agencyReportsApi, PLATFORM_LABELS } from "../api/agency-publications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

const STATUS_LABELS: Record<string, string> = {
  idea: "Ideas", in_production: "In production", awaiting_owner: "Awaiting review", changes_requested: "Changes requested", approved: "Approved", rejected: "Rejected",
};
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function summaryText(report: AgencyBrandReport, period: string) {
  const platforms = Object.entries(report.publishedByPlatform).map(([platform, count]) => `${PLATFORM_LABELS[platform] ?? platform} ${count}`).join(", ");
  return [
    `${report.brandName} (${report.clientName}) — ${period}`,
    `Approved content: ${report.approvedInPeriod}`,
    `Posts published: ${report.posts.published}${platforms ? ` (${platforms})` : ""}; scheduled: ${report.posts.scheduled}; failed: ${report.posts.failed}`,
    ...report.recentPosts.filter((post) => post.externalUrl).map((post) => `- ${post.contentTitle} on ${PLATFORM_LABELS[post.platform] ?? post.platform}: ${post.externalUrl}`),
  ].join("\n");
}

function BrandReportCard({ report, period }: { report: AgencyBrandReport; period: string }) {
  const [copied, setCopied] = useState(false);
  const inProgress = (report.contentByStatus.idea ?? 0) + (report.contentByStatus.in_production ?? 0) + (report.contentByStatus.awaiting_owner ?? 0) + (report.contentByStatus.changes_requested ?? 0);
  return (
    <Card className="block space-y-4 bg-transparent p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{report.brandName}</h2>
          <p className="text-sm text-muted-foreground">{report.clientName}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(summaryText(report, period)); setCopied(true); }}>
          {copied ? "Copied" : "Copy summary for client"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Approved this period" value={report.approvedInPeriod} />
        <Stat label="Posts published" value={report.posts.published} />
        <Stat label="Scheduled / failed" value={`${report.posts.scheduled} / ${report.posts.failed}`} />
        <Stat label="AI usage" value={usd(report.aiCostCents)} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>In progress: {inProgress}</span>
        {Object.entries(report.contentByStatus).map(([status, count]) => <span key={status}>{STATUS_LABELS[status] ?? status}: {count}</span>)}
      </div>
      {Object.keys(report.publishedByPlatform).length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {Object.entries(report.publishedByPlatform).map(([platform, count]) => <span key={platform}>{PLATFORM_LABELS[platform] ?? platform}: {count}</span>)}
        </div>
      )}
      {report.recentPosts.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {report.recentPosts.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-medium">{post.contentTitle}</span>
              <span className="text-muted-foreground">{PLATFORM_LABELS[post.platform] ?? post.platform}</span>
              {post.publishedAt && <span className="text-muted-foreground">{new Date(post.publishedAt).toLocaleDateString()}</span>}
              {post.externalUrl && <a className="underline" href={post.externalUrl} target="_blank" rel="noreferrer">View post</a>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Monthly results per brand: approved content, posts by platform and AI usage. */
export function AgencyReports() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  useEffect(() => setBreadcrumbs([{ label: "Reports" }]), [setBreadcrumbs]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const range = useMemo(() => ({
    from: month.toISOString(),
    to: new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString(),
  }), [month]);
  const period = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const reports = useQuery({
    queryKey: ["agency-reports", selectedCompanyId, range.from],
    queryFn: () => agencyReportsApi.brands(selectedCompanyId!, range),
    enabled: Boolean(selectedCompanyId),
  });
  const shift = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{period}</span>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      {reports.error && <p role="alert" className="text-sm text-destructive">{reports.error instanceof Error ? reports.error.message : "Could not load reports."}</p>}
      {reports.data?.length === 0 && <p className="text-sm text-muted-foreground">No brands yet. Add one in Clients &amp; Brands.</p>}
      {(reports.data ?? []).map((report) => <BrandReportCard key={report.brandId} report={report} period={period} />)}
    </div>
  );
}

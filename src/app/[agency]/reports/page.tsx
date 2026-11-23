import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { BrandReportCard } from "@/components/reports/BrandReportCard";
import { Button } from "@/components/ui/button";
import { zonedToUtc } from "@/lib/publications/timezone";
import { brandReports } from "@/lib/reports/brand-reports";
import { requireAgency } from "@/lib/session";

const REPORT_TZ = "Asia/Jakarta";
const fmt = (n: number) => n.toLocaleString("id-ID");

/** Monthly results per brand: approved content, posts by platform, AI usage. */
export default async function ReportsPage({ params, searchParams }: PageProps<"/[agency]/reports">) {
  const { agency: slug } = await params;
  const { month: monthParam } = await searchParams;
  const { agency } = await requireAgency(slug);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TZ });
  const match = typeof monthParam === "string" ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const year = match ? Number(match[1]) : Number(today.slice(0, 4));
  const month = match ? Number(match[2]) : Number(today.slice(5, 7));
  const key = (y: number, m: number) => { const d = new Date(Date.UTC(y, m - 1, 1)); return d.toISOString().slice(0, 7); };
  const from = zonedToUtc(`${key(year, month)}-01T00:00`, REPORT_TZ);
  const to = zonedToUtc(`${key(year, month + 1)}-01T00:00`, REPORT_TZ);
  const period = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  const { brands, chatTokens } = await brandReports(agency.id, from, to);

  return <div className="max-w-6xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><BarChart3 className="size-5 text-muted-foreground" /><h1 className="text-xl font-semibold">Laporan</h1></div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline"><Link href={`/${slug}/reports?month=${key(year, month - 1)}`} aria-label="Bulan sebelumnya"><ChevronLeft className="size-4" /></Link></Button>
        <span className="min-w-36 text-center font-medium capitalize">{period}</span>
        <Button asChild size="sm" variant="outline"><Link href={`/${slug}/reports?month=${key(year, month + 1)}`} aria-label="Bulan berikutnya"><ChevronRight className="size-4" /></Link></Button>
      </div>
    </div>
    <p className="text-sm text-muted-foreground">Periode dihitung dalam WIB. Pemakaian AI untuk chat agensi bulan ini: {fmt(chatTokens)} token.</p>
    {!brands.length && <p className="text-sm text-muted-foreground">Belum ada brand. Tambahkan di <Link href={`/${slug}/brands`} className="underline">Klien &amp; Brand</Link>.</p>}
    {brands.map((report) => <BrandReportCard key={report.brandId} report={report} period={period} />)}
  </div>;
}

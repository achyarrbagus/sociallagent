import { CalendarView, type CalendarEntry } from "@/components/calendar/CalendarView";
import { prisma } from "@/lib/prisma";
import { formatInZone } from "@/lib/publications/timezone";
import { requireAgency } from "@/lib/session";

const dayKey = (date: Date, timeZone: string) => date.toLocaleDateString("en-CA", { timeZone });

/** Month view of every scheduled, published, failed and cancelled post. Monday first, 6 weeks. */
export default async function CalendarPage({ params, searchParams }: PageProps<"/[agency]/calendar">) {
  const { agency: slug } = await params;
  const { month: monthParam } = await searchParams;
  const { agency, canManage } = await requireAgency(slug);
  const now = new Date();
  const match = typeof monthParam === "string" ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i)));
  // Pad a day each side so posts in far-off timezones still land in the grid.
  const from = new Date(days[0].getTime() - 86_400_000);
  const to = new Date(days[41].getTime() + 2 * 86_400_000);

  const rows = await prisma.publication.findMany({
    where: { organizationId: agency.id, scheduledAt: { gte: from, lt: to } },
    include: { content: { include: { brand: true } }, socialAccount: { select: { displayName: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  const assetIds = [...new Set(rows.flatMap((r) => r.assetIds))];
  const assets = assetIds.length ? await prisma.contentAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true, filename: true } }) : [];
  const assetName = new Map(assets.map((a) => [a.id, a.filename]));

  const entries: CalendarEntry[] = rows.map((r) => ({
    id: r.id,
    day: dayKey(r.scheduledAt, r.timezone),
    when: formatInZone(r.scheduledAt, r.timezone),
    time: formatInZone(r.scheduledAt, r.timezone, { hour: "2-digit", minute: "2-digit" }),
    contentId: r.contentId,
    title: r.content.title,
    brandName: r.content.brand.name,
    platform: r.platform,
    account: r.socialAccount?.displayName ?? r.accountLabel,
    dispatch: r.dispatch,
    status: r.status,
    approvalCurrent: r.content.status === "approved" && r.content.approvedRevisionNumber === r.revisionNumber && r.content.revisionNumber === r.revisionNumber,
    postText: r.postText,
    assets: r.assetIds.map((id) => ({ id, filename: assetName.get(id) ?? "Media" })),
    externalUrl: r.externalUrl,
    failureReason: r.failureReason,
  }));

  return <CalendarView
    slug={slug}
    canManage={canManage}
    monthLabel={first.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })}
    prev={`${new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 7)}`}
    next={`${new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 7)}`}
    days={days.map((d) => ({ key: d.toISOString().slice(0, 10), date: d.getUTCDate(), inMonth: d.getUTCMonth() === month }))}
    today={dayKey(now, "Asia/Jakarta")}
    entries={entries}
  />;
}

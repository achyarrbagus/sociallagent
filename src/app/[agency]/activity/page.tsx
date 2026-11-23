import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/agency/EmptyState";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";

const PAGE_SIZE = 50;

/** Full agency audit trail: people, agents and the publish worker. */
export default async function ActivityPage({ params, searchParams }: PageProps<"/[agency]/activity">) {
  const { agency: slug } = await params;
  const { page: pageParam } = await searchParams;
  const { agency } = await requireAgency(slug);
  const page = Math.max(1, Number(typeof pageParam === "string" ? pageParam : 1) || 1);
  const rows = await prisma.activityLog.findMany({
    where: { organizationId: agency.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
  });
  const userIds = [...new Set(rows.flatMap((r) => r.actorUserId ? [r.actorUserId] : []))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  const hasMore = rows.length > PAGE_SIZE;

  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold">Aktivitas</h1><p className="text-sm text-muted-foreground">Jejak semua perubahan oleh tim, agent AI, dan worker publikasi.</p></div>
    {!rows.length && <EmptyState icon={History} message="Belum ada aktivitas." />}
    {rows.length > 0 && <ul className="divide-y divide-border rounded-lg border bg-card">{rows.slice(0, PAGE_SIZE).map((r) => <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">{r.summary}</span>
      <span className="text-xs text-muted-foreground">{r.actorUserId ? name.get(r.actorUserId) ?? "Anggota" : "Sistem"} · {r.createdAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</span>
    </li>)}</ul>}
    <div className="flex justify-between">
      {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={`/${slug}/activity?page=${page - 1}`}>Lebih baru</Link></Button> : <span />}
      {hasMore && <Button asChild variant="outline" size="sm"><Link href={`/${slug}/activity?page=${page + 1}`}>Lebih lama</Link></Button>}
    </div>
  </div>;
}

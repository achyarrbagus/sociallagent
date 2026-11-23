import "server-only";
import { prisma } from "@/lib/prisma";
import { displayStatus, isContextCurrent } from "@/lib/content/lifecycle";
import type { ContentStatusValue } from "@/lib/content/schemas";

export type BrandReport = {
  brandId: string; brandName: string; clientName: string;
  contentByStatus: Partial<Record<ContentStatusValue, number>>;
  approvedInPeriod: number;
  posts: { scheduled: number; published: number; failed: number; unknown: number; cancelled: number };
  publishedByPlatform: Record<string, number>;
  recentPosts: { id: string; title: string; platform: string; externalUrl: string | null; publishedAt: string | null }[];
  aiTasks: number;
  aiTokens: number;
};

/** Monthly results per active brand, computed on demand (same as socialagent: nothing stored). */
export async function brandReports(organizationId: string, from: Date, to: Date): Promise<{ brands: BrandReport[]; chatTokens: number }> {
  const org = { organizationId };
  const [brands, contents, approvals, posts, usage, chat] = await Promise.all([
    prisma.brand.findMany({ where: { ...org, archivedAt: null }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.content.findMany({ where: org, include: { brand: { include: { client: true } }, campaign: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } } }),
    prisma.contentDecision.findMany({ where: { ...org, decision: "approve", createdAt: { gte: from, lt: to } }, select: { content: { select: { brandId: true } } } }),
    prisma.publication.findMany({ where: { ...org, scheduledAt: { gte: from, lt: to } }, include: { content: { select: { brandId: true, title: true } } }, orderBy: { publishedAt: "desc" } }),
    prisma.aiUsageEvent.groupBy({ by: ["brandId"], where: { ...org, source: "task", createdAt: { gte: from, lt: to } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.aiUsageEvent.aggregate({ where: { ...org, source: "chat", createdAt: { gte: from, lt: to } }, _sum: { inputTokens: true, outputTokens: true } }),
  ]);

  const reports = brands.map((brand): BrandReport => {
    const contentByStatus: BrandReport["contentByStatus"] = {};
    for (const c of contents.filter((c) => c.brandId === brand.id)) {
      const s = displayStatus(c, isContextCurrent(c, c.revisions[0], c));
      contentByStatus[s] = (contentByStatus[s] ?? 0) + 1;
    }
    const mine = posts.filter((p) => p.content.brandId === brand.id);
    const counts = { scheduled: 0, published: 0, failed: 0, unknown: 0, cancelled: 0 };
    const publishedByPlatform: Record<string, number> = {};
    for (const p of mine) {
      if (p.status in counts) counts[p.status as keyof typeof counts] += 1;
      if (p.status === "published") publishedByPlatform[p.platform] = (publishedByPlatform[p.platform] ?? 0) + 1;
    }
    const u = usage.find((row) => row.brandId === brand.id);
    return {
      brandId: brand.id, brandName: brand.name, clientName: brand.client.name, contentByStatus,
      approvedInPeriod: approvals.filter((a) => a.content.brandId === brand.id).length,
      posts: counts, publishedByPlatform,
      recentPosts: mine.filter((p) => p.status === "published").slice(0, 20).map((p) => ({
        id: p.id, title: p.content.title, platform: p.platform, externalUrl: p.externalUrl, publishedAt: p.publishedAt?.toISOString() ?? null,
      })),
      aiTasks: u?._count ?? 0,
      aiTokens: (u?._sum.inputTokens ?? 0) + (u?._sum.outputTokens ?? 0),
    };
  });
  return { brands: reports, chatTokens: (chat._sum.inputTokens ?? 0) + (chat._sum.outputTokens ?? 0) };
}

import "server-only";
import { prisma } from "@/lib/prisma";

const WEEK_MS = 7 * 86_400_000;

/**
 * Everything waiting on the owner: content to review, posts that need a decision,
 * and recent agent tasks that failed. Same set drives the sidebar badge.
 */
export async function inboxItems(organizationId: string) {
  const since = new Date(Date.now() - WEEK_MS);
  const [review, posts, tasks] = await Promise.all([
    prisma.content.findMany({ where: { organizationId, status: "awaiting_owner" }, include: { brand: { select: { name: true } } }, orderBy: { updatedAt: "asc" } }),
    prisma.publication.findMany({
      where: { organizationId, OR: [{ status: { in: ["failed", "unknown"] }, updatedAt: { gte: since } }, { status: "scheduled" }] },
      include: { content: { select: { title: true, status: true, revisionNumber: true, approvedRevisionNumber: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.contentTask.findMany({ where: { organizationId, status: "failed", finishedAt: { gte: since } }, include: { agent: { select: { name: true } }, content: { select: { title: true } } }, orderBy: { finishedAt: "desc" }, take: 20 }),
  ]);
  // A scheduled post only needs attention once its approval stopped covering it.
  const attentionPosts = posts.filter((p) => p.status !== "scheduled"
    || p.content.status !== "approved" || p.content.approvedRevisionNumber !== p.revisionNumber || p.content.revisionNumber !== p.revisionNumber);
  return { review, posts: attentionPosts, tasks };
}

export async function inboxCount(organizationId: string) {
  const { review, posts, tasks } = await inboxItems(organizationId);
  return review.length + posts.length + tasks.length;
}

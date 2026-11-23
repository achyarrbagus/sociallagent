import "server-only";
import { after } from "next/server";
import { tool } from "ai";
import { z } from "zod";
import { runContentTask } from "@/lib/agents/run";
import { ContentConflict, createContent, displayStatus, isContextCurrent, loadContent } from "@/lib/content/lifecycle";
import { CONTENT_STATUSES, PRODUCTION_ROLES } from "@/lib/content/schemas";
import { prisma } from "@/lib/prisma";

type Ctx = { organizationId: string; userId: string; canManage: boolean; agentName: string };

const fail = (error: unknown) => ({ error: error instanceof ContentConflict ? error.message : "Aksi gagal." });

/**
 * What an agent can do from chat. Reads are open to every member; writes act on behalf of
 * the signed-in owner/admin and stop where socialagent stops agents: no decisions, no publishing.
 */
export function chatTools(ctx: Ctx) {
  const org = { organizationId: ctx.organizationId };

  const read = {
    listBrands: tool({
      description: "Daftar klien, brand aktif, dan campaign-nya.",
      inputSchema: z.object({}),
      execute: async () => {
        const brands = await prisma.brand.findMany({
          where: { ...org, archivedAt: null, client: { archivedAt: null } },
          include: { client: { select: { name: true } }, campaigns: { where: { status: { not: "cancelled" } }, select: { id: true, name: true, status: true, objective: true, targetDate: true } } },
          orderBy: { name: "asc" },
        });
        return brands.map((b) => ({
          brandId: b.id, brand: b.name, client: b.client.name, timezone: b.timezone, audience: b.audience, toneOfVoice: b.toneOfVoice,
          brief: b.brief?.slice(0, 2000) ?? null, campaigns: b.campaigns,
        }));
      },
    }),
    listContent: tool({
      description: "Daftar konten agensi, bisa difilter brand atau status.",
      inputSchema: z.object({ brandId: z.string().optional(), status: z.enum(CONTENT_STATUSES).optional() }),
      execute: async ({ brandId, status }) => {
        const items = await prisma.content.findMany({
          where: { ...org, ...(brandId ? { brandId } : {}) },
          include: { brand: { include: { client: true } }, campaign: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
          orderBy: { updatedAt: "desc" }, take: 50,
        });
        return items
          .map((c) => ({ contentId: c.id, title: c.title, brand: c.brand.name, campaign: c.campaign.name, revision: c.revisionNumber, status: displayStatus(c, isContextCurrent(c, c.revisions[0], c)) }))
          .filter((c) => !status || c.status === status);
      },
    }),
    getContent: tool({
      description: "Detail revisi terbaru sebuah konten, feedback owner terakhir, dan tugas produksinya.",
      inputSchema: z.object({ contentId: z.string() }),
      execute: async ({ contentId }) => {
        const loaded = await loadContent(ctx.organizationId, contentId);
        if (!loaded) return { error: "Konten tidak ditemukan." };
        const { content, revision, contextCurrent } = loaded;
        const [feedback, tasks] = await Promise.all([
          prisma.contentDecision.findFirst({ where: { contentId, decision: "request_changes" }, orderBy: { createdAt: "desc" } }),
          prisma.contentTask.findMany({ where: { contentId }, include: { agent: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
        ]);
        return {
          contentId, brand: content.brand.name, campaign: content.campaign.name, status: displayStatus(content, contextCurrent), revision: revision.revisionNumber,
          title: revision.title, idea: revision.idea, hook: revision.hook, caption: revision.caption, script: revision.script, cta: revision.cta, format: revision.format,
          mediaCount: revision.assetIds.length, latestOwnerFeedback: feedback?.note ?? null,
          tasks: tasks.map((t) => ({ agent: t.agent.name, role: t.role, status: t.status, summary: t.summary, error: t.error })),
        };
      },
    }),
    listTeam: tool({
      description: "Anggota tim AI agensi dan statusnya.",
      inputSchema: z.object({}),
      execute: async () => (await prisma.agent.findMany({ where: org, orderBy: { createdAt: "asc" } }))
        .map((a) => ({ agentId: a.id, name: a.name, title: a.title, status: a.status })),
    }),
    recentActivity: tool({
      description: "Aktivitas terbaru di agensi (perubahan brand, konten, keputusan owner, posting).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(15) }),
      execute: async ({ limit }) => (await prisma.activityLog.findMany({ where: org, orderBy: { createdAt: "desc" }, take: limit }))
        .map((a) => ({ at: a.createdAt.toISOString(), summary: a.summary })),
    }),
    upcomingPosts: tool({
      description: "Posting terjadwal 14 hari ke depan.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const rows = await prisma.publication.findMany({
          where: { ...org, status: "scheduled", scheduledAt: { gte: now, lt: new Date(now.getTime() + 14 * 86_400_000) } },
          include: { content: { select: { title: true } } }, orderBy: { scheduledAt: "asc" }, take: 30,
        });
        return rows.map((p) => ({ title: p.content.title, platform: p.platform, at: p.scheduledAt.toISOString(), timezone: p.timezone, automatic: p.dispatch === "connector" }));
      },
    }),
  };

  if (!ctx.canManage) return read;

  return {
    ...read,
    createIdea: tool({
      description: "Buat ide konten baru (status Ide) untuk brand dan campaign tertentu. Owner tetap yang memilih ide untuk produksi.",
      inputSchema: z.object({
        brandId: z.string(), campaignId: z.string(),
        title: z.string().min(1).max(200), idea: z.string().max(10000).default(""),
      }),
      execute: async (input) => {
        try {
          const content = await createContent(ctx.organizationId, ctx.userId, input);
          await prisma.activityLog.create({ data: { ...org, actorUserId: ctx.userId, action: "content.created", entityType: "content", entityId: content.id, summary: `${ctx.agentName} menambahkan ide "${content.title}" lewat chat` } });
          return { contentId: content.id, title: content.title, status: "idea" };
        } catch (error) {
          return fail(error);
        }
      },
    }),
    assignTask: tool({
      description: "Beri tugas produksi ke agent lain untuk sebuah konten yang belum disetujui/ditolak. Agent itu akan menulis revisi baru.",
      inputSchema: z.object({
        contentId: z.string(), agentId: z.string(), role: z.enum(PRODUCTION_ROLES),
        instructions: z.string().max(5000).default(""),
      }),
      execute: async ({ contentId, agentId, role, instructions }) => {
        const loaded = await loadContent(ctx.organizationId, contentId);
        if (!loaded) return { error: "Konten tidak ditemukan." };
        if (["approved", "rejected"].includes(loaded.content.status)) return { error: "Konten sudah disetujui atau ditolak." };
        const agent = await prisma.agent.findFirst({ where: { id: agentId, ...org, status: { not: "paused" } } });
        if (!agent) return { error: "Agent tidak tersedia." };
        if (await prisma.contentTask.count({ where: { contentId, status: { in: ["queued", "running"] } } })) return { error: "Masih ada tugas berjalan untuk konten ini." };
        const task = await prisma.contentTask.create({
          data: { ...org, contentId, agentId, role, instructions: instructions || null, baseRevisionNumber: loaded.content.revisionNumber, createdByUserId: ctx.userId },
        });
        await prisma.activityLog.create({ data: { ...org, actorUserId: ctx.userId, action: "content.task_assigned", entityType: "content", entityId: contentId, summary: `${ctx.agentName} memberi tugas ${role} ke ${agent.name} lewat chat` } });
        after(() => runContentTask(task.id));
        return { taskId: task.id, assignedTo: agent.name, status: "queued" };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof chatTools>;

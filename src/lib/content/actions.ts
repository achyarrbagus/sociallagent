"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runContentTask } from "@/lib/agents/run";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { ContentConflict, createContent, decideContent, loadContent, reviseContent, submitContent } from "./lifecycle";
import { assignTaskInput, createContentInput, decideContentInput, reviseContentInput } from "./schemas";

export type ActionState = { ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> };

const read = (form: FormData) =>
  Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

async function owner(slug: string) {
  const ctx = await requireAgency(slug);
  if (!ctx.canManage) throw new ContentConflict("Hanya owner atau admin yang bisa melakukan ini.");
  return ctx;
}

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { ok: false, error: "Periksa kembali isian form.", fieldErrors: z.flattenError(error).fieldErrors };
  if (error instanceof ContentConflict) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "Terjadi kesalahan. Coba lagi." };
}

async function log(organizationId: string, userId: string, action: string, contentId: string, summary: string) {
  await prisma.activityLog.create({ data: { organizationId, actorUserId: userId, action, entityType: "content", entityId: contentId, summary } });
}

const refresh = (slug: string) => revalidatePath(`/${slug}`, "layout");

export async function createContentAction(slug: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { agency, user } = await owner(slug);
    const input = createContentInput.parse(read(form));
    const content = await createContent(agency.id, user.id, input);
    await log(agency.id, user.id, "content.created", content.id, `Menambahkan ide "${content.title}"`);
    id = content.id;
  } catch (error) {
    return fail(error);
  }
  refresh(slug);
  redirect(`/${slug}/content/${id}`);
}

export async function reviseContentAction(slug: string, contentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { agency, user } = await owner(slug);
    const { expectedRevisionNumber, ...snapshot } = reviseContentInput.parse({ ...read(form), assetIds: form.getAll("assetIds").map(String) });
    const next = await reviseContent(agency.id, contentId, expectedRevisionNumber, snapshot, { type: "user", id: user.id, isOwner: true });
    await log(agency.id, user.id, "content.revised", contentId, `Menyimpan revisi ${next} untuk "${snapshot.title}"`);
  } catch (error) {
    return fail(error);
  }
  refresh(slug);
  return { ok: true };
}

export async function submitContentAction(slug: string, contentId: string, expectedRevisionNumber: number): Promise<ActionState> {
  try {
    const { agency, user } = await owner(slug);
    await submitContent(agency.id, contentId, expectedRevisionNumber);
    await log(agency.id, user.id, "content.submitted", contentId, `Mengirim revisi ${expectedRevisionNumber} ke owner`);
  } catch (error) {
    return fail(error);
  }
  refresh(slug);
  return { ok: true };
}

const DECISION_LOG = {
  select_idea: "Memilih ide untuk produksi",
  approve: "Menyetujui konten",
  request_changes: "Meminta revisi konten",
  reject: "Menolak konten",
} as const;

export async function decideContentAction(slug: string, contentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { agency, user } = await owner(slug);
    const input = decideContentInput.parse(read(form));
    await decideContent(agency.id, contentId, user.id, input);
    await log(agency.id, user.id, `content.${input.decision}`, contentId, `${DECISION_LOG[input.decision]} (revisi ${input.expectedRevisionNumber})`);
  } catch (error) {
    return fail(error);
  }
  refresh(slug);
  return { ok: true };
}

export async function assignTaskAction(slug: string, contentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { agency, user } = await owner(slug);
    const input = assignTaskInput.parse(read(form));
    const loaded = await loadContent(agency.id, contentId);
    if (!loaded) throw new ContentConflict("Konten tidak ditemukan.");
    if (["approved", "rejected"].includes(loaded.content.status)) throw new ContentConflict("Konten yang sudah disetujui atau ditolak tidak perlu tugas produksi.");
    const agent = await prisma.agent.findFirst({ where: { id: input.agentId, organizationId: agency.id, status: { not: "paused" } } });
    if (!agent) throw new ContentConflict("Agent tidak tersedia.");
    const busy = await prisma.contentTask.count({ where: { contentId, status: { in: ["queued", "running"] } } });
    if (busy) throw new ContentConflict("Masih ada tugas yang berjalan untuk konten ini.");
    const task = await prisma.contentTask.create({
      data: {
        organizationId: agency.id, contentId, agentId: agent.id, role: input.role, instructions: input.instructions || null,
        baseRevisionNumber: loaded.content.revisionNumber, createdByUserId: user.id,
      },
    });
    await log(agency.id, user.id, "content.task_assigned", contentId, `Memberi tugas ${input.role} ke ${agent.name}`);
    after(() => runContentTask(task.id));
  } catch (error) {
    return fail(error);
  }
  refresh(slug);
  return { ok: true };
}

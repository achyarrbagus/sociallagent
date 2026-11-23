"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isApprovalValid, loadContent } from "@/lib/content/lifecycle";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { socialAdapter } from "@/lib/social/adapters/adapters";
import { completePublicationInput, schedulePublicationInput } from "./schemas";
import { zonedToUtc } from "./timezone";

export type PublishState = { ok: boolean; error?: string };

const read = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

async function owner(slug: string) {
  const ctx = await requireAgency(slug);
  if (!ctx.canManage) throw new Error("Hanya owner atau admin yang bisa mengatur jadwal.");
  return ctx;
}

const message = (error: unknown) => error instanceof z.ZodError ? error.issues[0]?.message ?? "Isian tidak valid."
  : error instanceof Error ? error.message : "Terjadi kesalahan.";

/**
 * Schedules the approved revision. The caption and media are copied in, so later edits to
 * the content never change what this post sends; they only make `approvalCurrent` false.
 */
export async function schedulePublication(slug: string, contentId: string, _prev: PublishState, form: FormData): Promise<PublishState> {
  try {
    const { agency, user } = await owner(slug);
    const input = schedulePublicationInput.parse(read(form));
    const loaded = await loadContent(agency.id, contentId);
    if (!loaded) throw new Error("Konten tidak ditemukan.");
    const { content, revision, contextCurrent } = loaded;
    if (!isApprovalValid(content, contextCurrent)) throw new Error("Hanya revisi yang disetujui dan masih berlaku yang bisa dijadwalkan.");
    const scheduledAt = zonedToUtc(input.scheduledAt, content.brand.timezone);
    if (scheduledAt.getTime() < Date.now() + 60_000) throw new Error("Jadwal minimal 1 menit dari sekarang.");
    const postText = input.postText || revision.caption;

    let dispatch: "manual" | "connector" = "manual";
    let socialAccountId: string | null = null;
    let accountLabel = input.accountLabel || null;
    let checkpoint: { expectedExternalAccountId: string } | undefined;
    if (input.socialAccountId) {
      const account = await prisma.socialAccount.findFirst({
        where: { id: input.socialAccountId, organizationId: agency.id, brandId: content.brandId, platform: input.platform as never, status: "active" },
      });
      const adapter = socialAdapter(input.platform);
      if (!account || !adapter) throw new Error("Akun sosial tidak aktif untuk brand dan platform ini.");
      if (!postText.trim()) throw new Error("Revisi yang disetujui belum punya caption.");
      dispatch = "connector";
      socialAccountId = account.id;
      accountLabel = account.displayName;
      checkpoint = { expectedExternalAccountId: account.externalAccountId };
    }

    const publication = await prisma.publication.create({
      data: {
        organizationId: agency.id, contentId, revisionNumber: revision.revisionNumber, platform: input.platform,
        accountLabel, socialAccountId, dispatch, scheduledAt, timezone: content.brand.timezone,
        postText, assetIds: revision.assetIds, checkpoint, createdByUserId: user.id,
      },
    });
    await prisma.activityLog.create({
      data: {
        organizationId: agency.id, actorUserId: user.id, action: "publication.scheduled", entityType: "publication", entityId: publication.id,
        summary: `Menjadwalkan "${revision.title}" ke ${input.platform}${dispatch === "connector" ? " (otomatis)" : ""}`,
      },
    });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}

export async function cancelPublication(slug: string, publicationId: string): Promise<PublishState> {
  try {
    const { agency, user } = await owner(slug);
    const { count } = await prisma.publication.updateMany({
      where: { id: publicationId, organizationId: agency.id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    if (!count) throw new Error("Hanya posting terjadwal yang bisa dibatalkan.");
    await prisma.activityLog.create({ data: { organizationId: agency.id, actorUserId: user.id, action: "publication.cancelled", entityType: "publication", entityId: publicationId, summary: "Membatalkan jadwal posting" } });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}

/** Owner records the outcome: manual posts, or resolving an ambiguous connector result. */
export async function completePublication(slug: string, publicationId: string, _prev: PublishState, form: FormData): Promise<PublishState> {
  try {
    const { agency, user } = await owner(slug);
    const input = completePublicationInput.parse(read(form));
    const publication = await prisma.publication.findFirst({ where: { id: publicationId, organizationId: agency.id }, include: { content: true } });
    if (!publication || !["scheduled", "unknown"].includes(publication.status)) throw new Error("Posting ini sudah selesai diproses.");
    if (input.status === "published" && publication.status === "scheduled") {
      const c = publication.content;
      if (c.status !== "approved" || c.approvedRevisionNumber !== publication.revisionNumber) {
        throw new Error("Persetujuan untuk revisi ini sudah tidak berlaku. Setujui ulang sebelum memposting.");
      }
    }
    const { count } = await prisma.publication.updateMany({
      where: { id: publicationId, status: publication.status },
      data: input.status === "published"
        ? { status: "published", externalUrl: input.externalUrl || null, publishedAt: new Date(), failureReason: null }
        : { status: "failed", failureReason: input.failureReason },
    });
    if (!count) throw new Error("Posting berubah saat diproses. Muat ulang dulu.");
    await prisma.activityLog.create({
      data: { organizationId: agency.id, actorUserId: user.id, action: `publication.${input.status}`, entityType: "publication", entityId: publicationId, summary: input.status === "published" ? "Menandai posting terbit" : "Menandai posting tidak terbit" },
    });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}

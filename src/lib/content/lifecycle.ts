import "server-only";
import type { Brand, Campaign, Client, Content, ContentRevision, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ContentDecisionValue, ContentStatusValue, SnapshotInput } from "./schemas";

type Tx = Prisma.TransactionClient;
type Context = { brand: Brand & { client: Client }; campaign: Campaign };

export class ContentConflict extends Error {}

/**
 * Guidance a revision was written against is still current: nothing archived, the campaign
 * still belongs to the brand, and brand/client/campaign guidance hasn't changed since.
 */
export function isContextCurrent(content: Content, revision: ContentRevision, ctx: Context) {
  return !ctx.brand.archivedAt
    && !ctx.brand.client.archivedAt
    && ctx.campaign.status !== "cancelled"
    && ctx.campaign.brandId === content.brandId
    && revision.brandUpdatedAt.getTime() === ctx.brand.updatedAt.getTime()
    && revision.clientUpdatedAt.getTime() === ctx.brand.client.updatedAt.getTime()
    && (revision.campaignObjective ?? null) === (ctx.campaign.objective ?? null);
}

export function isApprovalValid(content: Content, contextCurrent: boolean) {
  return content.status === "approved" && content.approvedRevisionNumber === content.revisionNumber && contextCurrent;
}

/** Status shown to people: approval or pending review silently stops counting once context drifts. */
export function displayStatus(content: Content, contextCurrent: boolean): ContentStatusValue {
  if (!contextCurrent && (content.status === "approved" || content.status === "awaiting_owner")) return "changes_requested";
  return content.status;
}

export async function loadContent(organizationId: string, contentId: string, tx: Tx = prisma) {
  const content = await tx.content.findFirst({
    where: { id: contentId, organizationId },
    include: { brand: { include: { client: true } }, campaign: true },
  });
  if (!content) return null;
  const revision = await tx.contentRevision.findUniqueOrThrow({
    where: { contentId_revisionNumber: { contentId, revisionNumber: content.revisionNumber } },
  });
  return { content, revision, contextCurrent: isContextCurrent(content, revision, content) };
}

function contextSnapshot(ctx: Context) {
  return {
    brandUpdatedAt: ctx.brand.updatedAt,
    clientUpdatedAt: ctx.brand.client.updatedAt,
    campaignObjective: ctx.campaign.objective,
  };
}

function assertActiveContext(ctx: Context) {
  if (ctx.brand.archivedAt || ctx.brand.client.archivedAt) throw new ContentConflict("Brand atau klien sudah diarsipkan.");
  if (ctx.campaign.status === "cancelled") throw new ContentConflict("Campaign sudah dibatalkan.");
}

export async function createContent(organizationId: string, userId: string, input: { brandId: string; campaignId: string; title: string; idea: string }) {
  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.findFirst({ where: { id: input.brandId, organizationId }, include: { client: true } });
    const campaign = await tx.campaign.findFirst({ where: { id: input.campaignId, organizationId } });
    if (!brand || !campaign || campaign.brandId !== brand.id) throw new ContentConflict("Campaign tidak cocok dengan brand.");
    assertActiveContext({ brand, campaign });
    const content = await tx.content.create({
      data: { organizationId, brandId: brand.id, campaignId: campaign.id, title: input.title },
    });
    await tx.contentRevision.create({
      data: {
        organizationId, contentId: content.id, revisionNumber: 1, title: input.title, idea: input.idea,
        createdByType: "user", createdById: userId, ...contextSnapshot({ brand, campaign }),
      },
    });
    return content;
  });
}

/**
 * Saves a full new revision. Optimistic lock on expectedRevisionNumber; clears approval.
 * Ideas stay ideas until the owner selects them; anything else returns to production.
 */
export async function reviseContent(
  organizationId: string,
  contentId: string,
  expectedRevisionNumber: number,
  snapshot: SnapshotInput,
  actor: { type: "user" | "agent"; id: string; isOwner: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadContent(organizationId, contentId, tx);
    if (!loaded) throw new ContentConflict("Konten tidak ditemukan.");
    const { content } = loaded;
    if (content.revisionNumber !== expectedRevisionNumber) throw new ContentConflict("Ada revisi yang lebih baru. Muat ulang dulu.");
    if (content.status === "rejected" && !actor.isOwner) throw new ContentConflict("Konten yang ditolak hanya bisa direvisi owner.");
    assertActiveContext(content);
    if (snapshot.assetIds.length) {
      const owned = await tx.contentAsset.count({ where: { contentId, id: { in: snapshot.assetIds } } });
      if (owned !== snapshot.assetIds.length) throw new ContentConflict("Media yang dipilih tidak ditemukan pada konten ini.");
    }
    const next = content.revisionNumber + 1;
    const { count } = await tx.content.updateMany({
      where: { id: contentId, revisionNumber: expectedRevisionNumber },
      data: {
        revisionNumber: next,
        title: snapshot.title,
        approvedRevisionNumber: null,
        status: content.status === "idea" ? "idea" : "in_production",
      },
    });
    if (!count) throw new ContentConflict("Ada revisi yang lebih baru. Muat ulang dulu.");
    await tx.contentRevision.create({
      data: {
        organizationId, contentId, revisionNumber: next, ...snapshot,
        createdByType: actor.type, createdById: actor.id, ...contextSnapshot(content),
      },
    });
    return next;
  });
}

/** Production → owner review. Needs something reviewable and current guidance. */
export async function submitContent(organizationId: string, contentId: string, expectedRevisionNumber: number) {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadContent(organizationId, contentId, tx);
    if (!loaded) throw new ContentConflict("Konten tidak ditemukan.");
    const { content, revision, contextCurrent } = loaded;
    if (content.revisionNumber !== expectedRevisionNumber) throw new ContentConflict("Ada revisi yang lebih baru. Muat ulang dulu.");
    if (content.status !== "in_production") throw new ContentConflict("Hanya konten dalam produksi yang bisa dikirim ke owner.");
    if (!revision.caption && !revision.script && !revision.assetIds.length) throw new ContentConflict("Isi caption, script, atau media dulu sebelum dikirim.");
    if (!contextCurrent) throw new ContentConflict("Konteks brand berubah. Simpan revisi baru dengan panduan terbaru.");
    await tx.content.updateMany({ where: { id: contentId, revisionNumber: expectedRevisionNumber }, data: { status: "awaiting_owner" } });
  });
}

const TRANSITIONS: Record<ContentDecisionValue, { from: ContentStatusValue[]; to: ContentStatusValue }> = {
  select_idea: { from: ["idea"], to: "in_production" },
  approve: { from: ["awaiting_owner"], to: "approved" },
  request_changes: { from: ["awaiting_owner", "approved"], to: "changes_requested" },
  reject: { from: ["idea", "in_production", "awaiting_owner", "changes_requested"], to: "rejected" },
};

export async function decideContent(
  organizationId: string,
  contentId: string,
  userId: string,
  input: { expectedRevisionNumber: number; decision: ContentDecisionValue; note: string },
) {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadContent(organizationId, contentId, tx);
    if (!loaded) throw new ContentConflict("Konten tidak ditemukan.");
    const { content, contextCurrent } = loaded;
    if (content.revisionNumber !== input.expectedRevisionNumber) throw new ContentConflict("Ada revisi yang lebih baru. Review versi terbaru dulu.");
    const rule = TRANSITIONS[input.decision];
    if (!rule.from.includes(content.status)) throw new ContentConflict("Keputusan ini tidak berlaku untuk status konten sekarang.");
    if (input.decision === "approve" && !contextCurrent) throw new ContentConflict("Konteks brand berubah sejak revisi ini dibuat.");
    const { count } = await tx.content.updateMany({
      where: { id: contentId, revisionNumber: input.expectedRevisionNumber, status: content.status },
      data: {
        status: rule.to,
        approvedRevisionNumber: input.decision === "approve" ? content.revisionNumber : null,
      },
    });
    if (!count) throw new ContentConflict("Konten berubah saat diproses. Muat ulang dulu.");
    await tx.contentDecision.create({
      data: {
        organizationId, contentId, revisionNumber: content.revisionNumber, decision: input.decision,
        note: input.note || null, decidedByUserId: userId,
      },
    });
    return rule.to;
  });
}

/** Brand, client or campaign guidance changed: pending and approved work needs another look. */
export async function invalidateContent(organizationId: string, where: Prisma.ContentWhereInput) {
  await prisma.content.updateMany({
    where: { ...where, organizationId, status: { in: ["approved", "awaiting_owner"] } },
    data: { status: "changes_requested", approvedRevisionNumber: null },
  });
}

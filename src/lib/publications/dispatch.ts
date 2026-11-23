import "server-only";
import type { Prisma, Publication } from "@/generated/prisma/client";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { isApprovalValid, loadContent } from "@/lib/content/lifecycle";
import { prisma } from "@/lib/prisma";
import { socialAdapter } from "@/lib/social/adapters/adapters";
import { redactSecrets } from "@/lib/social/adapters/redact";
import { checkPostAgainstRules, mediaKindOf, postShapeOf, type PublishMedia, type SocialAdapter } from "@/lib/social/adapters/types";
import { CREDENTIALS_PURPOSE } from "@/lib/social/constants";
import { publicBaseUrl, signedMediaUrl } from "@/lib/social/public-media";
import { getObject } from "@/lib/storage";

// Ported from socialagent social-publishing/dispatch.ts: no automatic retries.
// A failure needs a new schedule; an ambiguous outcome needs the owner to confirm.
export const CLAIM_LEASE_MS = 5 * 60_000;
const UNKNOWN_OUTCOME = "Hasil publikasi tidak pasti. Cek akun sosialnya, lalu konfirmasi terbit atau tidak.";

type Claim = Publication & { claimedAt: Date };
type Outcome = { status: "published"; providerPostId: string; externalUrl: string | null } | { status: "failed" | "unknown"; reason: string };

export async function sweepPending(limit = 10) {
  await recoverExpiredClaims();
  let processed = 0;
  for (; processed < limit; processed += 1) {
    const claim = await claimNext();
    if (!claim) break;
    await dispatchClaim(claim);
  }
  return processed;
}

async function recoverExpiredClaims() {
  const expired = await prisma.publication.findMany({
    where: { dispatch: "connector", status: "publishing", claimedAt: { lt: new Date(Date.now() - CLAIM_LEASE_MS) } },
    select: { id: true, organizationId: true, claimedAt: true },
  });
  for (const row of expired) {
    const { count } = await prisma.publication.updateMany({ where: { id: row.id, status: "publishing", claimedAt: row.claimedAt }, data: { status: "unknown", failureReason: UNKNOWN_OUTCOME } });
    if (count) await log(row.organizationId, row.id, "publication.outcome_unknown", "Hasil posting otomatis tidak pasti (lease habis)");
  }
}

async function claimNext(): Promise<Claim | null> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM publication
      WHERE dispatch = 'connector' AND status = 'scheduled' AND "scheduledAt" <= now()
      ORDER BY "scheduledAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!row) return null;
    return await tx.publication.update({ where: { id: row.id }, data: { status: "publishing", claimedAt: new Date(), failureReason: null } }) as Claim;
  });
}

/** Writes only while this worker still holds the claim. */
async function updateClaim(claim: Claim, data: Prisma.PublicationUpdateManyMutationInput) {
  const { count } = await prisma.publication.updateMany({ where: { id: claim.id, status: "publishing", claimedAt: claim.claimedAt }, data });
  return count > 0;
}

async function finish(claim: Claim, outcome: Outcome, secrets: string[] = []) {
  const reason = outcome.status === "published" ? null : redactSecrets(outcome.reason, secrets);
  const updated = await updateClaim(claim, outcome.status === "published"
    ? { status: "published", providerPostId: outcome.providerPostId, externalUrl: outcome.externalUrl, publishedAt: new Date(), failureReason: null }
    : { status: outcome.status, failureReason: reason });
  if (!updated) return;
  await log(claim.organizationId, claim.id, `publication.${outcome.status}`,
    outcome.status === "published" ? `Posting ${claim.platform} terbit otomatis` : `Posting ${claim.platform} ${outcome.status === "failed" ? "gagal" : "perlu dicek"}: ${reason}`);
}

async function log(organizationId: string, publicationId: string, action: string, summary: string) {
  await prisma.activityLog.create({ data: { organizationId, action, entityType: "publication", entityId: publicationId, summary: summary.slice(0, 500) } });
}

async function approvalCurrent(claim: Claim) {
  const loaded = await loadContent(claim.organizationId, claim.contentId);
  return !!loaded && isApprovalValid(loaded.content, loaded.contextCurrent) && loaded.content.revisionNumber === claim.revisionNumber;
}

async function activeAccount(claim: Claim) {
  if (!claim.socialAccountId) return null;
  const content = await prisma.content.findUnique({ where: { id: claim.contentId }, select: { brandId: true } });
  return prisma.socialAccount.findFirst({
    where: { id: claim.socialAccountId, organizationId: claim.organizationId, brandId: content?.brandId, platform: claim.platform as never, status: "active" },
  });
}

async function prepareMedia(claim: Claim, adapter: SocialAdapter): Promise<PublishMedia[]> {
  if (!claim.assetIds.length) return [];
  const rows = await prisma.contentAsset.findMany({ where: { id: { in: claim.assetIds }, contentId: claim.contentId } });
  if (rows.length !== claim.assetIds.length) throw new Error("Media yang disetujui sudah tidak tersedia.");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const base = publicBaseUrl();
  return claim.assetIds.map((id) => {
    const asset = byId.get(id)!;
    const kind = mediaKindOf(asset.contentType);
    if (!kind) throw new Error(`${asset.filename} bukan gambar atau video.`);
    return {
      assetId: asset.id, kind, contentType: asset.contentType, byteSize: asset.byteSize, filename: asset.filename,
      signedUrl: adapter.platform === "instagram" && base ? signedMediaUrl(base, claim.id, asset.id) : null,
      read: () => getObject(asset.storageKey),
    };
  });
}

async function dispatchClaim(claim: Claim) {
  if (!await approvalCurrent(claim)) {
    return finish(claim, { status: "failed", reason: "Revisi yang disetujui atau konteks brand berubah; tidak ada yang diposting." });
  }
  const adapter = socialAdapter(claim.platform);
  if (!adapter) return finish(claim, { status: "failed", reason: `Publikasi otomatis belum tersedia untuk ${claim.platform}.` });
  const expectedExternalId = (claim.checkpoint as { expectedExternalAccountId?: string } | null)?.expectedExternalAccountId;
  const account = await activeAccount(claim);
  if (!account?.credentials || !expectedExternalId || account.externalAccountId !== expectedExternalId) {
    return finish(claim, { status: "failed", reason: "Akun sosial sudah tidak aktif. Hubungkan ulang dan jadwalkan lagi." });
  }
  if (claim.platform !== "tiktok" && account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
    return finish(claim, { status: "failed", reason: "Token akun sosial sudah kedaluwarsa. Hubungkan ulang dan jadwalkan lagi." });
  }

  let credentials: Record<string, string>;
  try {
    credentials = decryptJson<Record<string, string>>(CREDENTIALS_PURPOSE, account.credentials);
  } catch {
    return finish(claim, { status: "failed", reason: "Kredensial akun sosial tidak bisa dibaca. Hubungkan ulang." });
  }
  const secrets = Object.values(credentials);

  let media: PublishMedia[];
  try {
    media = await prepareMedia(claim, adapter);
    const issues = checkPostAgainstRules(adapter.label, adapter.rules, {
      text: claim.postText,
      media: media.map(({ kind, contentType, byteSize, filename }) => ({ kind, contentType, byteSize, filename })),
    }, { publicBaseUrl: publicBaseUrl() !== null });
    if (!claim.postText.trim()) issues.push("Tidak ada caption untuk diposting.");
    if (issues.length) throw new Error(issues.join(" "));
  } catch (error) {
    return finish(claim, { status: "failed", reason: error instanceof Error ? error.message : "Media tidak bisa dimuat." }, secrets);
  }

  // Last look before anything leaves the building.
  if (!await approvalCurrent(claim)) {
    return finish(claim, { status: "failed", reason: "Persetujuan berubah sebelum dikirim; tidak ada yang diposting." }, secrets);
  }
  const latest = await activeAccount(claim);
  if (!latest || latest.credentials !== account.credentials || latest.externalAccountId !== expectedExternalId) {
    return finish(claim, { status: "failed", reason: "Akun sosial berubah sebelum dikirim; tidak ada yang diposting." }, secrets);
  }

  try {
    const outcome = await adapter.publish({
      text: claim.postText,
      shape: postShapeOf(media),
      media,
      credentials,
      checkpoint: (claim.checkpoint as Record<string, unknown> | null) ?? {},
      saveCheckpoint: async (next) => {
        if (!await updateClaim(claim, { checkpoint: next as Prisma.InputJsonValue })) throw new Error("Klaim publikasi habis sebelum checkpoint tersimpan.");
      },
      withFreshCredentials: (refresh) => refreshCredentials(claim, account.id, expectedExternalId, refresh),
      fetch,
    });
    await finish(claim, outcome, secrets);
  } catch (error) {
    await finish(claim, { status: "unknown", reason: error instanceof Error ? error.message : UNKNOWN_OUTCOME }, secrets);
  }
}

/** TikTok rotates tokens: refresh under a row lock and store the new pair encrypted. */
async function refreshCredentials(
  claim: Claim,
  accountId: string,
  expectedExternalId: string,
  refresh: (credentials: Record<string, string>) => Promise<{ credentials: Record<string, string>; tokenExpiresAt: Date }>,
) {
  if (claim.platform !== "tiktok") throw new Error("Refresh kredensial hanya untuk TikTok.");
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ credentials: string | null; tokenExpiresAt: Date | null; externalAccountId: string; status: string }[]>`
      SELECT credentials, "tokenExpiresAt", "externalAccountId", status FROM social_account WHERE id = ${accountId} FOR UPDATE`;
    if (!locked?.credentials || locked.status !== "active" || locked.externalAccountId !== expectedExternalId) {
      throw new Error("Akun TikTok berubah sebelum token diperbarui.");
    }
    const current = decryptJson<Record<string, string>>(CREDENTIALS_PURPOSE, locked.credentials);
    if (locked.tokenExpiresAt && locked.tokenExpiresAt.getTime() > Date.now() + 5 * 60_000) return current;
    const refreshed = await refresh(current);
    if (refreshed.tokenExpiresAt.getTime() <= Date.now()) throw new Error("TikTok mengembalikan token yang sudah kedaluwarsa.");
    await tx.socialAccount.update({
      where: { id: accountId },
      data: { credentials: encryptJson(CREDENTIALS_PURPOSE, refreshed.credentials), tokenExpiresAt: refreshed.tokenExpiresAt },
    });
    return refreshed.credentials;
  }, { timeout: 30_000 });
}

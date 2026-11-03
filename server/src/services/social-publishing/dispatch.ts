import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lte, lt, or, sql } from "drizzle-orm";
import {
  agencyBrands,
  agencyClients,
  agencyContentItems,
  agencyPublications,
  agencySocialAccounts,
  assets,
  companies,
  projects,
  type Db,
} from "@paperclipai/db";
import type { AgencyContentSnapshot } from "@paperclipai/shared";
import { checkPostAgainstRules, mediaKindOf, postShapeOf, type PublishMedia, type SocialAdapter } from "./types.js";
import { socialAdapter } from "./adapters.js";
import { secretService } from "../secrets.js";
import { logActivity } from "../activity-log.js";
import { lockAgencyContentCompany } from "../agency-content-lifecycle.js";
import type { StorageService } from "../../storage/types.js";
import { redactSecrets } from "./redact.js";

export const AGENCY_PUBLICATION_CLAIM_LEASE_MS = 5 * 60_000;
const DEFAULT_SWEEP_LIMIT = 10;
const UNKNOWN_OUTCOME_REASON = "The publisher stopped before it could confirm the provider result. Verify the social account before retrying.";

type PublicationRow = typeof agencyPublications.$inferSelect;
type Claim = { publication: PublicationRow };
type DispatchOptions = {
  fetchImpl?: typeof fetch;
  adapterFor?: (platform: string) => SocialAdapter | null;
  now?: () => Date;
  sweepLimit?: number;
};

type SnapshotAsset = NonNullable<AgencyContentSnapshot["assets"]>[number];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function failureText(reason: string, credentials: Record<string, string>) {
  return redactSecrets(reason, Object.values(credentials)).slice(0, 2000);
}

async function readObject(storage: StorageService, companyId: string, objectKey: string, expectedBytes: number, expectedSha256: string): Promise<Buffer> {
  const object = await storage.getObject(companyId, objectKey);
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of object.stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > expectedBytes) throw new Error("Asset content is larger than its approved metadata.");
      chunks.push(bytes);
    }
  } finally {
    object.stream.destroy();
  }
  if (length !== expectedBytes) throw new Error("Asset content no longer matches its approved metadata.");
  const body = Buffer.concat(chunks, length);
  if (createHash("sha256").update(body).digest("hex") !== expectedSha256) {
    throw new Error("Asset content no longer matches its approved checksum.");
  }
  return body;
}

export function agencyPublicationDispatchService(
  db: Db,
  storage: StorageService,
  options: DispatchOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const adapterFor = options.adapterFor ?? socialAdapter;
  const now = options.now ?? (() => new Date());
  const sweepLimit = options.sweepLimit ?? DEFAULT_SWEEP_LIMIT;
  let nextDeadline: number | null = null;

  async function dueCandidate(at: Date) {
    const [candidate] = await db.select({ id: agencyPublications.id, companyId: agencyPublications.companyId })
      .from(agencyPublications)
      .where(and(
        eq(agencyPublications.status, "scheduled"),
        eq(agencyPublications.dispatch, "connector"),
        lte(agencyPublications.scheduledAt, at),
      ))
      .orderBy(asc(agencyPublications.scheduledAt), asc(agencyPublications.id))
      .limit(1);
    return candidate ?? null;
  }

  async function claimNext(at: Date): Promise<Claim | null> {
    const candidate = await dueCandidate(at);
    if (!candidate) return null;
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as Db;
      await lockAgencyContentCompany(txDb, candidate.companyId);
      const [publication] = await tx.select().from(agencyPublications).where(and(
        eq(agencyPublications.id, candidate.id),
        eq(agencyPublications.companyId, candidate.companyId),
        eq(agencyPublications.status, "scheduled"),
        eq(agencyPublications.dispatch, "connector"),
        lte(agencyPublications.scheduledAt, at),
      )).for("update", { skipLocked: true });
      if (!publication) return null;
      await tx.select({ id: agencyContentItems.id }).from(agencyContentItems).where(and(
        eq(agencyContentItems.companyId, publication.companyId),
        eq(agencyContentItems.id, publication.contentId),
      )).for("update");
      const [claimed] = await tx.update(agencyPublications).set({
        status: "publishing",
        claimedAt: at,
        failureReason: null,
        updatedAt: at,
      }).where(and(
        eq(agencyPublications.id, publication.id),
        eq(agencyPublications.status, "scheduled"),
      )).returning();
      return claimed ? { publication: claimed } : null;
    });
  }

  async function updateClaim(claim: Claim, values: Partial<typeof agencyPublications.$inferInsert>) {
    const publication = claim.publication;
    const [updated] = await db.update(agencyPublications).set({ ...values, updatedAt: now() }).where(and(
      eq(agencyPublications.id, publication.id),
      eq(agencyPublications.companyId, publication.companyId),
      eq(agencyPublications.status, "publishing"),
      eq(agencyPublications.claimedAt, publication.claimedAt!),
    )).returning();
    return updated ?? null;
  }

  async function finish(claim: Claim, result: { status: "published"; providerPostId: string; externalUrl: string } | { status: "failed" | "unknown"; reason: string }, credentials: Record<string, string> = {}) {
    const reason = result.status === "published" ? null : failureText(result.reason, credentials);
    const updated = await updateClaim(claim, result.status === "published"
      ? { status: "published", providerPostId: result.providerPostId, externalUrl: result.externalUrl, publishedAt: now(), failureReason: null }
      : { status: result.status, failureReason: reason });
    if (!updated) return;
    await logActivity(db, {
      companyId: updated.companyId,
      actorType: "system",
      actorId: "agency-publication-dispatcher",
      action: result.status === "published" ? "agency.publication.published" : result.status === "unknown" ? "agency.publication.outcome_unknown" : "agency.publication.failed",
      entityType: "agency_content",
      entityId: updated.contentId,
      details: result.status === "published"
        ? { publicationId: updated.id, platform: updated.platform, providerPostId: result.providerPostId, externalUrl: result.externalUrl }
        : { publicationId: updated.id, platform: updated.platform, reason },
    });
  }

  async function currentAccount(claim: Claim) {
    const publication = claim.publication;
    if (!publication.socialAccountId) return null;
    const [joined] = await db.select({ account: agencySocialAccounts })
      .from(agencyContentItems)
      .innerJoin(agencySocialAccounts, and(
        eq(agencySocialAccounts.id, publication.socialAccountId),
        eq(agencySocialAccounts.companyId, publication.companyId),
        eq(agencySocialAccounts.brandId, agencyContentItems.brandId),
        eq(agencySocialAccounts.platform, publication.platform),
        eq(agencySocialAccounts.status, "active"),
      ))
      .where(and(
        eq(agencyContentItems.id, publication.contentId),
        eq(agencyContentItems.companyId, publication.companyId),
      ));
    return joined ?? null;
  }

  async function prepareMedia(publication: PublicationRow, snapshot: AgencyContentSnapshot, adapter: SocialAdapter): Promise<PublishMedia[]> {
    const approvedAssets = snapshot.assets ?? [];
    if (!approvedAssets.length) return [];
    const ids = approvedAssets.map(asset => asset.assetId);
    if (new Set(ids).size !== ids.length) throw new Error("The approved revision contains duplicate media assets.");
    const rows = await db.select().from(assets).where(and(
      eq(assets.companyId, publication.companyId),
      inArray(assets.id, ids),
    ));
    if (rows.length !== approvedAssets.length) throw new Error("An approved media asset is no longer available.");
    const byId = new Map(rows.map(asset => [asset.id, asset]));
    const media: PublishMedia[] = [];
    for (const approved of approvedAssets as SnapshotAsset[]) {
      const asset = byId.get(approved.assetId);
      if (!asset || asset.byteSize !== approved.byteSize || asset.contentType !== approved.contentType || asset.sha256 !== approved.sha256) {
        throw new Error("An approved media asset changed after approval.");
      }
      const kind = mediaKindOf(asset.contentType);
      if (!kind) throw new Error("An approved media asset has an unsupported media type.");
      media.push({
        assetId: asset.id,
        kind,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        filename: asset.originalFilename,
        signedUrl: null,
        read: () => readObject(storage, publication.companyId, asset.objectKey, asset.byteSize, asset.sha256),
      });
    }
    const text = publication.postText ?? snapshot.caption ?? "";
    const problems = checkPostAgainstRules(adapter.label, adapter.rules, {
      text,
      media: media.map(({ kind, contentType, byteSize, filename }) => ({ kind, contentType, byteSize, filename })),
    }, { publicBaseUrl: false });
    if (problems.length) throw new Error(problems.join(" "));
    return media;
  }

  async function approvalContextCurrent(publication: PublicationRow, snapshot: AgencyContentSnapshot) {
    const [item] = await db.select().from(agencyContentItems).where(and(
      eq(agencyContentItems.companyId, publication.companyId),
      eq(agencyContentItems.id, publication.contentId),
    ));
    if (!item || item.status !== "approved" || item.revisionNumber !== publication.revisionNumber || item.approvedRevisionNumber !== publication.revisionNumber) return false;
    const [brand] = await db.select().from(agencyBrands).where(and(eq(agencyBrands.companyId, publication.companyId), eq(agencyBrands.id, item.brandId)));
    const [client] = brand ? await db.select().from(agencyClients).where(and(eq(agencyClients.companyId, publication.companyId), eq(agencyClients.id, brand.clientId))) : [];
    const [project] = await db.select().from(projects).where(and(eq(projects.companyId, publication.companyId), eq(projects.id, item.projectId)));
    const [company] = await db.select().from(companies).where(eq(companies.id, publication.companyId));
    return Boolean(brand && client && project && company && !brand.archivedAt && !client.archivedAt && !project.archivedAt
      && project.brandId === item.brandId && company.status === "active"
      && snapshot.brandUpdatedAt === brand.updatedAt.toISOString()
      && snapshot.clientUpdatedAt === client.updatedAt.toISOString()
      && snapshot.projectDescription === project.description);
  }

  async function dispatchClaim(claim: Claim) {
    const publication = claim.publication;
    const snapshot = publication.snapshot as unknown as AgencyContentSnapshot;
    if (!await approvalContextCurrent(publication, snapshot)) {
      await finish(claim, { status: "failed", reason: "The approved revision or its brand, client, campaign, or company context changed; nothing was posted." });
      return;
    }

    const adapter = adapterFor(publication.platform);
    if (!adapter) {
      await finish(claim, { status: "failed", reason: `Automatic publishing is not available for ${publication.platform}.` });
      return;
    }
    const joined = await currentAccount(claim);
    const account = joined?.account;
    const initialCheckpoint = record(publication.checkpoint) ?? {};
    const expectedExternalAccountId = typeof initialCheckpoint.expectedExternalAccountId === "string"
      ? initialCheckpoint.expectedExternalAccountId
      : null;
    if (!account || account.status !== "active" || !account.credentialsSecretId
      || !expectedExternalAccountId || account.externalAccountId !== expectedExternalAccountId) {
      await finish(claim, { status: "failed", reason: "The connected social account is no longer active. Reconnect it and schedule a new post." });
      return;
    }
    if (publication.platform !== "tiktok" && account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= now().getTime()) {
      await finish(claim, { status: "failed", reason: "The connected social account token has expired. Reconnect it and schedule a new post." });
      return;
    }

    let credentials: Record<string, string>;
    try {
      const parsed = record(JSON.parse(await secretService(db).resolveSecretValue(publication.companyId, account.credentialsSecretId, "latest")));
      if (!parsed || Object.values(parsed).some(value => typeof value !== "string")) throw new Error("Invalid stored social account credentials.");
      credentials = parsed as Record<string, string>;
    } catch {
      await finish(claim, { status: "failed", reason: "The connected social account credentials could not be loaded. Reconnect it and schedule a new post." });
      return;
    }

    let media: PublishMedia[];
    try {
      media = await prepareMedia(publication, snapshot, adapter);
      const text = publication.postText ?? snapshot.caption ?? "";
      const issues = checkPostAgainstRules(adapter.label, adapter.rules, {
        text,
        media: media.map(({ kind, contentType, byteSize, filename }) => ({ kind, contentType, byteSize, filename })),
      }, { publicBaseUrl: false });
      if (!text.trim()) issues.push("The approved revision has no caption to publish.");
      if (issues.length) throw new Error(issues.join(" "));
    } catch (error) {
      await finish(claim, { status: "failed", reason: error instanceof Error ? error.message : "Approved media could not be loaded." }, credentials);
      return;
    }

    if (!await approvalContextCurrent(publication, snapshot)) {
      await finish(claim, { status: "failed", reason: "The approved revision or its brand, client, campaign, or company context changed before sending; nothing was posted." }, credentials);
      return;
    }
    const refreshedAccount = (await currentAccount(claim))?.account;
    if (!refreshedAccount || refreshedAccount.status !== "active"
      || refreshedAccount.credentialsSecretId !== account.credentialsSecretId
      || refreshedAccount.externalAccountId !== expectedExternalAccountId
      || (publication.platform !== "tiktok" && refreshedAccount.tokenExpiresAt && refreshedAccount.tokenExpiresAt.getTime() <= now().getTime())) {
      await finish(claim, { status: "failed", reason: "The connected social account changed or expired before sending; nothing was posted." }, credentials);
      return;
    }

    const checkpoint = record(publication.checkpoint) ?? {};
    try {
      const outcome = await adapter.publish({
        text: publication.postText ?? snapshot.caption ?? "",
        shape: postShapeOf(media),
        media,
        credentials,
        checkpoint,
        saveCheckpoint: async next => {
          const updated = await updateClaim(claim, { checkpoint: next });
          if (!updated) throw new Error("The publication claim expired before its provider checkpoint could be saved.");
          publication.checkpoint = next;
        },
        withFreshCredentials: async refresh => {
          if (publication.platform !== "tiktok") throw new Error("Credential refresh is only enabled for TikTok accounts.");
          return db.transaction(async tx => {
            const txDb = tx as unknown as Db;
            await lockAgencyContentCompany(txDb, publication.companyId);
            const [lockedAccount] = await tx.select().from(agencySocialAccounts).where(and(
              eq(agencySocialAccounts.id, account.id),
              eq(agencySocialAccounts.companyId, publication.companyId),
              eq(agencySocialAccounts.status, "active"),
            )).for("update");
            if (!lockedAccount || lockedAccount.credentialsSecretId !== account.credentialsSecretId
              || lockedAccount.externalAccountId !== expectedExternalAccountId) {
              throw new Error("The connected TikTok account changed before its token could be refreshed.");
            }
            const secrets = secretService(db);
            const secret = await secrets.getById(lockedAccount.credentialsSecretId!);
            if (!secret || secret.companyId !== publication.companyId || secret.status !== "active") {
              throw new Error("The connected TikTok credentials are no longer available.");
            }
            const parsed = record(JSON.parse(await secrets.resolveSecretValue(publication.companyId, secret.id, "latest")));
            if (!parsed || Object.values(parsed).some(value => typeof value !== "string")) {
              throw new Error("The connected TikTok credentials are invalid.");
            }
            const currentCredentials = parsed as Record<string, string>;
            if (lockedAccount.tokenExpiresAt && lockedAccount.tokenExpiresAt.getTime() > now().getTime() + 5 * 60_000) {
              return currentCredentials;
            }
            const refreshed = await refresh(currentCredentials);
            if (refreshed.tokenExpiresAt.getTime() <= now().getTime()) {
              throw new Error("TikTok returned an already-expired access token.");
            }
            await secrets.rotate(secret.id, {
              value: JSON.stringify(refreshed.credentials),
              expectedLatestVersion: secret.latestVersion,
            });
            const [updatedAccount] = await tx.update(agencySocialAccounts).set({
              tokenExpiresAt: refreshed.tokenExpiresAt,
              updatedAt: now(),
            }).where(and(
              eq(agencySocialAccounts.id, lockedAccount.id),
              eq(agencySocialAccounts.companyId, publication.companyId),
              eq(agencySocialAccounts.credentialsSecretId, secret.id),
              eq(agencySocialAccounts.status, "active"),
            )).returning({ id: agencySocialAccounts.id });
            if (!updatedAccount) throw new Error("The TikTok account changed while its refreshed token was being saved.");
            return refreshed.credentials;
          });
        },
        fetch: fetchImpl,
      });
      if (outcome.status === "published") await finish(claim, outcome, credentials);
      else await finish(claim, { status: outcome.status, reason: outcome.reason }, credentials);
    } catch (error) {
      await finish(claim, {
        status: "unknown",
        reason: error instanceof Error ? error.message : UNKNOWN_OUTCOME_REASON,
      }, credentials);
    }
  }

  async function recoverExpiredClaims(at: Date) {
    const expiredBefore = new Date(at.getTime() - AGENCY_PUBLICATION_CLAIM_LEASE_MS);
    const expired = await db.update(agencyPublications).set({
      status: "unknown",
      failureReason: UNKNOWN_OUTCOME_REASON,
      updatedAt: at,
    }).where(and(
      eq(agencyPublications.dispatch, "connector"),
      eq(agencyPublications.status, "publishing"),
      lt(agencyPublications.claimedAt, expiredBefore),
    )).returning();
    for (const publication of expired) {
      await logActivity(db, {
        companyId: publication.companyId,
        actorType: "system",
        actorId: "agency-publication-dispatcher",
        action: "agency.publication.outcome_unknown",
        entityType: "agency_content",
        entityId: publication.contentId,
        details: { publicationId: publication.id, platform: publication.platform, reason: UNKNOWN_OUTCOME_REASON },
      });
    }
  }

  async function refreshNextDeadline() {
    const at = now();
    const [row] = await db.execute<{ next_at: Date | string | null }>(sql`
      SELECT min(deadline) AS next_at FROM (
        SELECT scheduled_at AS deadline
        FROM agency_publications
        WHERE dispatch = 'connector' AND status = 'scheduled' AND scheduled_at > ${at.toISOString()}::timestamptz
        UNION ALL
        SELECT claimed_at + (${AGENCY_PUBLICATION_CLAIM_LEASE_MS} * interval '1 millisecond') AS deadline
        FROM agency_publications
        WHERE dispatch = 'connector' AND status = 'publishing' AND claimed_at IS NOT NULL
      ) deadlines`);
    if (!row || row.next_at == null) {
      nextDeadline = null;
      return;
    }
    nextDeadline = row.next_at instanceof Date ? row.next_at.getTime() : Date.parse(row.next_at);
    if (!Number.isFinite(nextDeadline)) throw new Error("Agency publication dispatch deadline is invalid");
  }

  return {
    async sweepPending(signal?: AbortSignal) {
      const at = now();
      await recoverExpiredClaims(at);
      for (let count = 0; count < sweepLimit && !signal?.aborted; count += 1) {
        const claim = await claimNext(now());
        if (!claim) break;
        await dispatchClaim(claim);
      }
      await refreshNextDeadline();
    },
    async hasPending() {
      const at = now();
      const rows = await db.select({ id: agencyPublications.id }).from(agencyPublications).where(or(
        and(eq(agencyPublications.status, "scheduled"), eq(agencyPublications.dispatch, "connector"), lte(agencyPublications.scheduledAt, at)),
        and(eq(agencyPublications.status, "publishing"), eq(agencyPublications.dispatch, "connector"), lt(agencyPublications.claimedAt, new Date(at.getTime() - AGENCY_PUBLICATION_CLAIM_LEASE_MS))),
      )).limit(1);
      return rows.length > 0;
    },
    nextRunAt() {
      return nextDeadline;
    },
  };
}

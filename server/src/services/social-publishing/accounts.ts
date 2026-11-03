import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { agencyBrands, agencyClients, agencySocialAccounts, type Db } from "@paperclipai/db";
import type { AgencySocialAccount, SocialConnectorPlatform } from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { logActivity, type LogActivityInput } from "../activity-log.js";
import { secretService } from "../secrets.js";
import { lockAgencyContentCompany } from "../agency-content-lifecycle.js";
import { socialAdapter } from "./adapters.js";

type Actor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId">;
type AccountRow = typeof agencySocialAccounts.$inferSelect;

function toView(row: AccountRow): AgencySocialAccount {
  return {
    id: row.id,
    companyId: row.companyId,
    brandId: row.brandId,
    platform: row.platform as SocialConnectorPlatform,
    displayName: row.displayName,
    externalAccountId: row.externalAccountId,
    status: row.status as AgencySocialAccount["status"],
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function socialAccountsService(db: Db, fetchImpl: typeof fetch = fetch) {
  return {
    async list(companyId: string, brandId?: string) {
      const rows = await db.select().from(agencySocialAccounts).where(and(
        eq(agencySocialAccounts.companyId, companyId),
        ...(brandId ? [eq(agencySocialAccounts.brandId, brandId)] : []),
      ));
      return rows.map(toView);
    },

    async connect(companyId: string, brandId: string, platform: SocialConnectorPlatform, credentials: Record<string, string>, actorUserId: string | null, actor: Actor) {
      const adapter = socialAdapter(platform);
      if (!adapter) throw unprocessable(`The ${platform} connector is not available yet.`);
      const allowedFields = new Set(adapter.credentialFields.map((field) => field.key));
      if (Object.keys(credentials).some((key) => !allowedFields.has(key))) {
        throw unprocessable(`The ${adapter.label} connection contains an unsupported credential field.`);
      }
      let verified: Awaited<ReturnType<typeof adapter.verify>>;
      try {
        verified = await adapter.verify(credentials, fetchImpl);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : `${adapter.label} account verification could not be confirmed.`;
        throw unprocessable(message);
      }
      const secrets = secretService(db);
      const secret = await secrets.create(companyId, {
        name: `${adapter.label} ${verified.displayName} (${randomUUID()})`,
        key: `agency_social_${randomUUID()}`,
        provider: "local_encrypted",
        value: JSON.stringify(verified.credentials ?? credentials),
        description: `Encrypted credentials for ${adapter.label} account ${verified.externalAccountId}`,
      }, { userId: actorUserId });

      let oldSecretId: string | null = null;
      let result: AccountRow;
      try {
        result = await db.transaction(async (tx) => {
          const txDb = tx as unknown as Db;
          await lockAgencyContentCompany(txDb, companyId);
          const [brand] = await tx.select({ brand: agencyBrands, client: agencyClients })
            .from(agencyBrands)
            .innerJoin(agencyClients, and(eq(agencyClients.id, agencyBrands.clientId), eq(agencyClients.companyId, agencyBrands.companyId)))
            .where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.id, brandId)))
            .for("update");
          if (!brand || brand.brand.archivedAt || brand.client.archivedAt) throw notFound("Active brand not found");

          const [existing] = await tx.select().from(agencySocialAccounts).where(and(
            eq(agencySocialAccounts.companyId, companyId),
            eq(agencySocialAccounts.brandId, brandId),
            eq(agencySocialAccounts.platform, platform),
          )).for("update");
          if (existing?.status === "active") throw conflict(`A ${adapter.label} account is already connected to this brand. Disconnect it before reconnecting.`);
          oldSecretId = existing?.credentialsSecretId ?? null;
          const values = {
            companyId,
            brandId,
            platform,
            displayName: verified.displayName,
            externalAccountId: verified.externalAccountId,
            credentialsSecretId: secret.id,
            status: "active",
            tokenExpiresAt: verified.tokenExpiresAt,
            lastVerifiedAt: new Date(),
            createdByUserId: actorUserId,
            updatedAt: new Date(),
          };
          const [row] = existing
            ? await tx.update(agencySocialAccounts).set(values).where(eq(agencySocialAccounts.id, existing.id)).returning()
            : await tx.insert(agencySocialAccounts).values(values).returning();
          await logActivity(txDb, {
            ...actor,
            companyId,
            action: "agency.social_account.connected",
            entityType: "agency_social_account",
            entityId: row!.id,
            details: { brandId, platform, externalAccountId: verified.externalAccountId },
          });
          return row!;
        });
      } catch (error) {
        await secrets.remove(secret.id).catch(() => undefined);
        throw error;
      }
      if (oldSecretId) await secrets.remove(oldSecretId).catch(() => undefined);
      return toView(result);
    },

    async disconnect(companyId: string, id: string, actor: Actor) {
      let secretId: string | null = null;
      const row = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        await lockAgencyContentCompany(txDb, companyId);
        const [existing] = await tx.select().from(agencySocialAccounts).where(and(
          eq(agencySocialAccounts.companyId, companyId),
          eq(agencySocialAccounts.id, id),
        )).for("update");
        if (!existing) throw notFound("Social account not found");
        if (existing.status === "revoked") return existing;
        secretId = existing.credentialsSecretId;
        const [revoked] = await tx.update(agencySocialAccounts).set({
          status: "revoked",
          credentialsSecretId: null,
          updatedAt: new Date(),
        }).where(eq(agencySocialAccounts.id, id)).returning();
        await logActivity(txDb, {
          ...actor,
          companyId,
          action: "agency.social_account.disconnected",
          entityType: "agency_social_account",
          entityId: id,
          details: { brandId: existing.brandId, platform: existing.platform },
        });
        return revoked!;
      });
      if (secretId) await secretService(db).remove(secretId);
      return toView(row);
    },
  };
}

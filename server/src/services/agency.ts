import { and, asc, eq } from "drizzle-orm";
import { agencyBrands, agencyClients, type Db } from "@paperclipai/db";
import type { CreateAgencyBrand, CreateAgencyClient, UpdateAgencyBrand, UpdateAgencyClient } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { logActivity, type LogActivityInput } from "./activity-log.js";
import { invalidateAgencyBrandContent, invalidateAgencyClientContent } from "./agency-content-invalidation.js";
import { lockAgencyContentCompany } from "./agency-content-lifecycle.js";

type Actor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId">;

async function lockActiveClient(db: Db, companyId: string, clientId: string) {
  const [client] = await db.select().from(agencyClients).where(and(eq(agencyClients.companyId, companyId), eq(agencyClients.id, clientId))).for("share");
  if (!client || client.archivedAt) throw unprocessable("Choose an active client in this agency.");
  return client;
}

/** Call inside the project mutation transaction: archive and new bindings serialize. */
export async function assertActiveAgencyBrand(db: Db, companyId: string, brandId: string) {
  const [brand] = await db.select({ brand: agencyBrands, client: agencyClients }).from(agencyBrands)
    .innerJoin(agencyClients, and(eq(agencyClients.id, agencyBrands.clientId), eq(agencyClients.companyId, agencyBrands.companyId)))
    .where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.id, brandId))).for("share");
  if (!brand || brand.brand.archivedAt || brand.client.archivedAt) {
    throw unprocessable("Choose an active brand and client in this agency.");
  }
}

export function agencyService(db: Db) {
  return {
    async list(companyId: string) {
      const [clients, brands] = await Promise.all([
        db.select().from(agencyClients).where(eq(agencyClients.companyId, companyId)).orderBy(asc(agencyClients.name), asc(agencyClients.id)),
        db.select().from(agencyBrands).where(eq(agencyBrands.companyId, companyId)).orderBy(asc(agencyBrands.name), asc(agencyBrands.id)),
      ]);
      return { clients, brands };
    },
    async createClient(companyId: string, input: CreateAgencyClient, actor: Actor) {
      return db.transaction(async tx => {
        await lockAgencyContentCompany(tx as unknown as Db, companyId);
        const [client] = await tx.insert(agencyClients).values({ ...input, companyId }).returning();
        await logActivity(tx as unknown as Db, { ...actor, companyId, action: "agency.client.created", entityType: "agency_client", entityId: client.id, details: { name: client.name } });
        return client;
      });
    },
    async updateClient(companyId: string, id: string, input: UpdateAgencyClient, actor: Actor) {
      return db.transaction(async tx => {
        await lockAgencyContentCompany(tx as unknown as Db, companyId);
        const [client] = await tx.update(agencyClients).set({ ...input, archivedAt: input.archivedAt === undefined ? undefined : input.archivedAt === null ? null : new Date(input.archivedAt), updatedAt: new Date() })
          .where(and(eq(agencyClients.companyId, companyId), eq(agencyClients.id, id))).returning();
        if (!client) throw notFound("Client not found");
        await invalidateAgencyClientContent(tx as unknown as Db, companyId, id);
        await logActivity(tx as unknown as Db, { ...actor, companyId, action: "agency.client.updated", entityType: "agency_client", entityId: id, details: { changedKeys: Object.keys(input) } });
        return client;
      });
    },
    async createBrand(companyId: string, input: CreateAgencyBrand, actor: Actor) {
      return db.transaction(async tx => {
        await lockAgencyContentCompany(tx as unknown as Db, companyId);
        await lockActiveClient(tx as unknown as Db, companyId, input.clientId);
        const [brand] = await tx.insert(agencyBrands).values({ ...input, companyId }).returning();
        await logActivity(tx as unknown as Db, { ...actor, companyId, action: "agency.brand.created", entityType: "agency_brand", entityId: brand.id, details: { name: brand.name, clientId: brand.clientId } });
        return brand;
      });
    },
    async updateBrand(companyId: string, id: string, input: UpdateAgencyBrand, actor: Actor) {
      return db.transaction(async tx => {
        await lockAgencyContentCompany(tx as unknown as Db, companyId);
        const [existing] = await tx.select({ clientId: agencyBrands.clientId }).from(agencyBrands)
          .where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.id, id))).for("update");
        if (!existing) throw notFound("Brand not found");
        if (input.clientId && input.clientId !== existing.clientId) {
          await lockActiveClient(tx as unknown as Db, companyId, input.clientId);
        }
        const [brand] = await tx.update(agencyBrands).set({ ...input, archivedAt: input.archivedAt === undefined ? undefined : input.archivedAt === null ? null : new Date(input.archivedAt), updatedAt: new Date() })
          .where(and(eq(agencyBrands.companyId, companyId), eq(agencyBrands.id, id))).returning();
        if (!brand) throw notFound("Brand not found");
        await invalidateAgencyBrandContent(tx as unknown as Db, companyId, [id]);
        await logActivity(tx as unknown as Db, { ...actor, companyId, action: "agency.brand.updated", entityType: "agency_brand", entityId: id, details: { changedKeys: Object.keys(input) } });
        return brand;
      });
    },
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateContent } from "@/lib/content/lifecycle";
import { requireAgency } from "@/lib/session";
import { brandInput, campaignInput, clientInput } from "./schemas";

export type FormState = { ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> };

function read(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

/** Every mutation goes through here: membership + manager role, then tenant-scoped writes. */
async function manage(slug: string) {
  const ctx = await requireAgency(slug);
  if (!ctx.canManage) throw new Error("Hanya owner atau admin yang bisa mengubah data agensi.");
  return ctx;
}

async function log(organizationId: string, actorUserId: string, action: string, entityType: string, entityId: string, summary: string) {
  await prisma.activityLog.create({ data: { organizationId, actorUserId, action, entityType, entityId, summary } });
}

function invalid(error: z.ZodError): FormState {
  return { ok: false, error: "Periksa kembali isian form.", fieldErrors: z.flattenError(error).fieldErrors };
}

function failed(error: unknown): FormState {
  return { ok: false, error: error instanceof Error ? error.message : "Terjadi kesalahan." };
}

export async function saveClient(slug: string, clientId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { agency, user } = await manage(slug);
    const parsed = clientInput.safeParse(read(form));
    if (!parsed.success) return invalid(parsed.error);
    if (clientId) {
      const { count } = await prisma.client.updateMany({ where: { id: clientId, organizationId: agency.id }, data: parsed.data });
      if (!count) return { ok: false, error: "Klien tidak ditemukan." };
      await invalidateContent(agency.id, { brand: { clientId } });
      await log(agency.id, user.id, "client.updated", "client", clientId, `Memperbarui klien ${parsed.data.name}`);
    } else {
      const client = await prisma.client.create({ data: { ...parsed.data, organizationId: agency.id } });
      await log(agency.id, user.id, "client.created", "client", client.id, `Menambahkan klien ${client.name}`);
    }
    revalidatePath(`/${slug}`, "layout");
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

export async function saveBrand(slug: string, brandId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { agency, user } = await manage(slug);
    const parsed = brandInput.safeParse(read(form));
    if (!parsed.success) return invalid(parsed.error);
    const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, organizationId: agency.id } });
    if (!client) return { ok: false, error: "Klien tidak ditemukan." };
    if (brandId) {
      const { count } = await prisma.brand.updateMany({ where: { id: brandId, organizationId: agency.id }, data: parsed.data });
      if (!count) return { ok: false, error: "Brand tidak ditemukan." };
      await invalidateContent(agency.id, { brandId });
      await log(agency.id, user.id, "brand.updated", "brand", brandId, `Memperbarui brand ${parsed.data.name}`);
    } else {
      const brand = await prisma.brand.create({ data: { ...parsed.data, organizationId: agency.id } });
      await log(agency.id, user.id, "brand.created", "brand", brand.id, `Menambahkan brand ${brand.name} untuk ${client.name}`);
    }
    revalidatePath(`/${slug}`, "layout");
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

export async function saveCampaign(slug: string, campaignId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { agency, user } = await manage(slug);
    const parsed = campaignInput.safeParse(read(form));
    if (!parsed.success) return invalid(parsed.error);
    const brand = await prisma.brand.findFirst({ where: { id: parsed.data.brandId, organizationId: agency.id, archivedAt: null } });
    if (!brand) return { ok: false, error: "Brand tidak ditemukan atau sudah diarsipkan." };
    if (campaignId) {
      const before = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId: agency.id } });
      if (!before) return { ok: false, error: "Campaign tidak ditemukan." };
      await prisma.campaign.update({ where: { id: campaignId }, data: parsed.data });
      const guidanceChanged = before.brandId !== parsed.data.brandId
        || (before.objective ?? null) !== (parsed.data.objective ?? null)
        || parsed.data.status === "cancelled";
      if (guidanceChanged) await invalidateContent(agency.id, { campaignId });
      await log(agency.id, user.id, "campaign.updated", "campaign", campaignId, `Memperbarui campaign ${parsed.data.name}`);
    } else {
      const campaign = await prisma.campaign.create({ data: { ...parsed.data, organizationId: agency.id } });
      await log(agency.id, user.id, "campaign.created", "campaign", campaign.id, `Membuat campaign ${campaign.name} untuk ${brand.name}`);
    }
    revalidatePath(`/${slug}`, "layout");
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

export async function setArchived(slug: string, kind: "client" | "brand", id: string, archived: boolean) {
  const { agency, user } = await manage(slug);
  const data = { archivedAt: archived ? new Date() : null };
  const where = { id, organizationId: agency.id };
  const { count } = kind === "client"
    ? await prisma.client.updateMany({ where, data })
    : await prisma.brand.updateMany({ where, data });
  if (count) await invalidateContent(agency.id, kind === "client" ? { brand: { clientId: id } } : { brandId: id });
  if (count) await log(agency.id, user.id, `${kind}.${archived ? "archived" : "restored"}`, kind, id, `${archived ? "Mengarsipkan" : "Memulihkan"} ${kind === "client" ? "klien" : "brand"}`);
  revalidatePath(`/${slug}`, "layout");
}

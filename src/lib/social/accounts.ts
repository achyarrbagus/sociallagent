"use server";

import { revalidatePath } from "next/cache";
import { encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { socialAdapter } from "./adapters/adapters";
import { redactSecrets } from "./adapters/redact";
import { CREDENTIALS_PURPOSE } from "./constants";

export type ConnectState = { ok: boolean; error?: string };

/**
 * Verifies credentials live against the provider, then stores them encrypted.
 * One active account per brand and platform; a revoked row is reused on reconnect.
 */
export async function connectSocialAccount(slug: string, brandId: string, platform: string, _prev: ConnectState, form: FormData): Promise<ConnectState> {
  const { agency, user, canManage } = await requireAgency(slug);
  if (!canManage) return { ok: false, error: "Hanya owner atau admin yang bisa menghubungkan akun." };
  const adapter = socialAdapter(platform);
  if (!adapter) return { ok: false, error: "Platform belum didukung." };
  const brand = await prisma.brand.findFirst({ where: { id: brandId, organizationId: agency.id }, include: { client: true } });
  if (!brand || brand.archivedAt || brand.client.archivedAt) return { ok: false, error: "Brand tidak aktif." };

  const credentials: Record<string, string> = {};
  for (const field of adapter.credentialFields) {
    const value = String(form.get(field.key) ?? "").trim();
    if (!value || value.length > 4096) return { ok: false, error: `${field.label} wajib diisi.` };
    credentials[field.key] = value;
  }
  const existing = await prisma.socialAccount.findUnique({ where: { brandId_platform: { brandId, platform: adapter.platform } } });
  if (existing?.status === "active") return { ok: false, error: `${adapter.label} sudah terhubung. Putuskan dulu untuk mengganti.` };

  let verified;
  try {
    verified = await adapter.verify(credentials, fetch);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verifikasi gagal.";
    return { ok: false, error: `Verifikasi ${adapter.label} gagal: ${redactSecrets(message, Object.values(credentials))}` };
  }
  const sealed = encryptJson(CREDENTIALS_PURPOSE, verified.credentials ?? credentials);
  const data = {
    displayName: verified.displayName.slice(0, 200),
    externalAccountId: verified.externalAccountId,
    credentials: sealed,
    status: "active" as const,
    tokenExpiresAt: verified.tokenExpiresAt,
    lastVerifiedAt: new Date(),
    createdByUserId: user.id,
  };
  const account = existing
    ? await prisma.socialAccount.update({ where: { id: existing.id }, data })
    : await prisma.socialAccount.create({ data: { ...data, organizationId: agency.id, brandId, platform: adapter.platform } });
  await prisma.activityLog.create({
    data: { organizationId: agency.id, actorUserId: user.id, action: "social.connected", entityType: "social_account", entityId: account.id, summary: `Menghubungkan ${adapter.label} ${account.displayName} ke ${brand.name}` },
  });
  revalidatePath(`/${slug}`, "layout");
  return { ok: true };
}

export async function disconnectSocialAccount(slug: string, accountId: string) {
  const { agency, user, canManage } = await requireAgency(slug);
  if (!canManage) return;
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, organizationId: agency.id, status: "active" } });
  if (!account) return;
  // Credentials are destroyed, not just flagged.
  await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "revoked", credentials: null } });
  await prisma.activityLog.create({
    data: { organizationId: agency.id, actorUserId: user.id, action: "social.disconnected", entityType: "social_account", entityId: account.id, summary: `Memutus ${account.platform} ${account.displayName}` },
  });
  revalidatePath(`/${slug}`, "layout");
}

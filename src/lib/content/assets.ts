"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAgency } from "@/lib/session";
import { putObject } from "@/lib/storage";
import { MAX_MEDIA_BYTES, MEDIA_TYPES } from "./schemas";

export type UploadState = { ok: boolean; error?: string };

/** Uploads media to a content item. It joins a revision only when someone saves one that selects it. */
export async function uploadContentAsset(slug: string, contentId: string, _prev: UploadState, form: FormData): Promise<UploadState> {
  const { agency, user, canManage } = await requireAgency(slug);
  if (!canManage) return { ok: false, error: "Hanya owner atau admin yang bisa mengunggah media." };
  const content = await prisma.content.findFirst({ where: { id: contentId, organizationId: agency.id }, select: { id: true } });
  if (!content) return { ok: false, error: "Konten tidak ditemukan." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Pilih file dulu." };
  if (await prisma.contentAsset.count({ where: { contentId } }) + files.length > 50) return { ok: false, error: "Maksimal 50 media per konten." };
  for (const file of files) {
    if (!MEDIA_TYPES[file.type]) return { ok: false, error: `${file.name}: format ${file.type || "tidak dikenal"} belum didukung (JPEG, PNG, WebP, MP4, MOV).` };
    if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: `${file.name} lebih dari 100 MB.` };
  }
  for (const file of files) {
    const body = Buffer.from(await file.arrayBuffer());
    const storageKey = `${agency.id}/${contentId}/${randomUUID()}`;
    await putObject(storageKey, body);
    await prisma.contentAsset.create({
      data: {
        organizationId: agency.id, contentId, filename: file.name.slice(0, 255), contentType: file.type,
        byteSize: body.byteLength, sha256: createHash("sha256").update(body).digest("hex"), storageKey, uploadedById: user.id,
      },
    });
  }
  revalidatePath(`/${slug}/content/${contentId}`);
  return { ok: true };
}

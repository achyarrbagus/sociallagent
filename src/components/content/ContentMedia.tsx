"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { uploadContentAsset, type UploadState } from "@/lib/content/assets";

export type AssetView = { id: string; filename: string; contentType: string; byteSize: number };

export function AssetPreview({ asset }: { asset: AssetView }) {
  const src = `/api/assets/${asset.id}`;
  return <figure className="space-y-1">
    {asset.contentType.startsWith("image/")
      // eslint-disable-next-line @next/next/no-img-element -- private, member-only asset route
      ? <img src={src} alt={asset.filename} className="max-h-72 max-w-full rounded-md border object-contain" />
      : <video src={src} controls className="max-h-72 max-w-full rounded-md border" />}
    <figcaption className="text-xs text-muted-foreground"><a href={src} target="_blank" rel="noopener noreferrer" className="underline">{asset.filename}</a> · {(asset.byteSize / 1024 / 1024).toFixed(1)} MB</figcaption>
  </figure>;
}

/** Upload pool for this content. Media joins a revision only when a revision selects it. */
export function ContentMediaUpload({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadContentAsset.bind(null, slug, contentId), { ok: false });
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="text-sm" disabled={pending} />
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Mengunggah…" : "Unggah media"}</Button>
    {state.error && <p role="alert" className="w-full text-sm text-destructive">{state.error}</p>}
    {state.ok && <p role="status" className="w-full text-sm text-muted-foreground">Media terunggah. Pilih di editor untuk memasukkannya ke revisi baru.</p>}
  </form>;
}

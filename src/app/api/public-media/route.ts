import { prisma } from "@/lib/prisma";
import { readMediaToken } from "@/lib/social/public-media";
import { getObject } from "@/lib/storage";

/** Unauthenticated, short-lived media URL for providers (Instagram) that fetch by URL. */
export async function GET(request: Request) {
  const claims = readMediaToken(new URL(request.url).searchParams.get("token") ?? "");
  if (!claims) return new Response("Not found", { status: 404 });
  const publication = await prisma.publication.findUnique({ where: { id: claims.publicationId }, select: { assetIds: true, status: true, contentId: true } });
  if (!publication || publication.status !== "publishing" || !publication.assetIds.includes(claims.assetId)) return new Response("Not found", { status: 404 });
  const asset = await prisma.contentAsset.findFirst({ where: { id: claims.assetId, contentId: publication.contentId } });
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await getObject(asset.storageKey)), {
    headers: { "Content-Type": asset.contentType, "Content-Length": String(asset.byteSize), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

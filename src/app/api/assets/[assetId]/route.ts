import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getObject } from "@/lib/storage";

/** Member-only media download. Assets are immutable, so private caching is safe. */
export async function GET(_request: Request, { params }: RouteContext<"/api/assets/[assetId]">) {
  const { assetId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const asset = await prisma.contentAsset.findFirst({
    where: { id: assetId, content: { organization: { members: { some: { userId: session.user.id } } } } },
  });
  if (!asset) return new Response("Not found", { status: 404 });
  const body = await getObject(asset.storageKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.byteSize),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

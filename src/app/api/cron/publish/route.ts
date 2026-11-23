import { sweepPending } from "@/lib/publications/dispatch";

/** Called every minute by a scheduler (Vercel Cron, system cron, or the dev interval in instrumentation.ts). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processed = await sweepPending();
  return Response.json({ processed });
}

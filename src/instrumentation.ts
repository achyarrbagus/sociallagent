/** Local/self-hosted publish worker. On Vercel, use a cron hitting /api/cron/publish instead. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.PUBLISH_WORKER !== "interval") return;
  const { sweepPending } = await import("@/lib/publications/dispatch");
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    sweepPending().catch((error) => console.error("[publish-worker]", error)).finally(() => { running = false; });
  }, 30_000);
}

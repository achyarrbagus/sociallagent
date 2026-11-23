"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { agencySelectClass } from "@/components/agency/AgencyForm";
import { AnimatedAgentIcon } from "@/components/brand/AnimatedAgentIcon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assignTaskAction, type ActionState } from "@/lib/content/actions";
import { PRODUCTION_ROLES, PRODUCTION_ROLE_LABELS } from "@/lib/content/schemas";

type Task = {
  id: string; role: (typeof PRODUCTION_ROLES)[number]; status: "queued" | "running" | "done" | "failed";
  agentName: string; summary: string | null; error: string | null; resultRevisionNumber: number | null; createdAt: string;
};

const STATUS_LABELS: Record<Task["status"], string> = { queued: "Antre", running: "Sedang dikerjakan", done: "Selesai", failed: "Gagal" };

export function ContentTasks({ slug, contentId, canManage, agents, tasks }: {
  slug: string; contentId: string; canManage: boolean;
  agents: { id: string; name: string; title: string }[];
  tasks: Task[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(assignTaskAction.bind(null, slug, contentId), { ok: false });
  const active = tasks.some((t) => t.status === "queued" || t.status === "running");
  // Agent runs happen after the response; poll until they land.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);

  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Tugas produksi</h2>
    {!tasks.length && <p className="text-sm text-muted-foreground">Belum ada tugas untuk tim AI.</p>}
    <ul className="space-y-3">{tasks.map((t) => <li key={t.id} className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(t.status === "queued" || t.status === "running") && <AnimatedAgentIcon className="size-5" />}
        <strong>{t.agentName}</strong><span className="text-muted-foreground">· {PRODUCTION_ROLE_LABELS[t.role]} · {STATUS_LABELS[t.status]}</span>
        {t.resultRevisionNumber && <span className="text-muted-foreground">· menulis revisi {t.resultRevisionNumber}</span>}
      </div>
      {t.summary && <p className="whitespace-pre-wrap text-sm">{t.summary}</p>}
      {t.error && <p className="text-sm text-destructive">{t.error}</p>}
    </li>)}</ul>
    {canManage && <form action={action} className="space-y-3 border-t pt-4">
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {!agents.length && <p className="text-sm text-muted-foreground">Belum ada tim AI. Siapkan tim di menu Tim AI.</p>}
      <fieldset disabled={pending || active || !agents.length} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="content-task-role">Jenis kerja</Label>
          <select id="content-task-role" name="role" className={agencySelectClass} defaultValue="copywriting">
            {PRODUCTION_ROLES.map((r) => <option key={r} value={r}>{PRODUCTION_ROLE_LABELS[r]}</option>)}
          </select></div>
        <div className="space-y-2"><Label htmlFor="content-task-agent">Agent</Label>
          <select id="content-task-agent" name="agentId" required className={agencySelectClass} defaultValue="">
            <option value="" disabled>Pilih agent</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.name !== a.title ? ` (${a.title})` : ""}</option>)}
          </select></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="content-task-instructions">Arahan (opsional)</Label>
          <Textarea id="content-task-instructions" name="instructions" maxLength={5000} placeholder="Mis. buat 3 opsi hook, fokus ke promo buka puasa" /></div>
      </fieldset>
      <div className="flex justify-end"><Button type="submit" disabled={pending || active || !agents.length}>{pending ? "Memberi tugas…" : "Beri tugas"}</Button></div>
      <p className="text-sm text-muted-foreground">Agent menulis revisi baru dari konteks brand dan feedback terakhir. Tugas selesai tidak pernah menyetujui konten.</p>
    </form>}
  </section>;
}

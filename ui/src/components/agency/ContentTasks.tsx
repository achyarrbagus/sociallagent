import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AGENCY_PRODUCTION_ROLES, type AgencyContentDetail, type LinkAgencyContentTask } from "@paperclipai/shared";
import { agentsApi } from "../../api/agents";
import { issuesApi } from "../../api/issues";
import { agencyContentApi } from "../../api/agency-content";
import { Link } from "../../lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { agencySelectClass } from "./AgencyForm";

export function ContentTasks({ data, onChanged }: { data: AgencyContentDetail; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const agents = useQuery({ queryKey: ["agency-production-agents", data.companyId], queryFn: () => agentsApi.list(data.companyId), enabled: data.canManage });
  const candidates = useQuery({ queryKey: ["agency-production-candidates", data.companyId, data.projectId], queryFn: () => issuesApi.list(data.companyId, { projectId: data.projectId, limit: 100 }), enabled: data.canManage && mode === "link" });
  const task = useMutation({
    mutationFn: async (input: { role: LinkAgencyContentTask["role"]; assigneeAgentId: string; issueId: string }) => {
      if (mode === "link") return agencyContentApi.linkTask(data.companyId, data.id, { expectedRevisionNumber: data.revisionNumber, issueId: input.issueId, role: input.role });
      return agencyContentApi.prepareTask(data.companyId, data, input.assigneeAgentId, input.role);
    }, onSuccess: onChanged,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    task.mutate({ role: String(fields.get("role")) as LinkAgencyContentTask["role"], assigneeAgentId: String(fields.get("agentId") ?? ""), issueId: String(fields.get("issueId") ?? "") });
  }
  return <section className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Production tasks</h2>
    {data.tasks.length === 0 && <p className="text-sm text-muted-foreground">No production tasks linked yet.</p>}
    {data.tasks.map(t => <div key={t.issueId} className="space-y-1"><Link to={`/issues/${t.issueId}`} className="text-sm underline underline-offset-4">{t.title}</Link><p className="text-sm text-muted-foreground">{t.role} · {t.status}</p></div>)}
    {data.canManage && <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={mode === "create" ? "secondary" : "outline"} disabled={task.isPending} onClick={() => { task.reset(); setMode("create"); }}>Assign new task</Button><Button type="button" size="sm" variant={mode === "link" ? "secondary" : "outline"} disabled={task.isPending} onClick={() => { task.reset(); setMode("link"); }}>Link existing task</Button></div>
      {task.error && <p role="alert" className="text-sm text-destructive">{task.error.message}</p>}
      {(agents.error || candidates.error) && <p role="alert" className="text-sm text-destructive">{agents.error?.message ?? candidates.error?.message}</p>}
      <fieldset disabled={task.isPending} className="space-y-3">
        <div className="space-y-2"><Label htmlFor="content-task-role">Work type</Label><select id="content-task-role" name="role" className={agencySelectClass}>{AGENCY_PRODUCTION_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></div>
        {mode === "create" ? <div className="space-y-2"><Label htmlFor="content-task-agent">Assigned agent</Label><select id="content-task-agent" name="agentId" required className={agencySelectClass} defaultValue=""><option value="" disabled>Select an agent</option>{(agents.data ?? []).filter(a => !["terminated", "pending_approval"].includes(a.status)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          : <div className="space-y-2"><Label htmlFor="content-existing-task">Campaign task ID</Label><Input id="content-existing-task" name="issueId" list="content-task-options" required placeholder="Choose a task or paste its UUID" /><datalist id="content-task-options">{(candidates.data ?? []).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</datalist></div>}
      </fieldset>
      <div className="flex justify-end"><Button type="submit" disabled={task.isPending || (mode === "create" && (agents.isLoading || !!agents.error))}>{task.isPending ? "Preparing task…" : mode === "create" ? "Assign production task" : "Link task"}</Button></div>
      <p className="text-sm text-muted-foreground">New tasks are linked before entering the normal execution queue. Task completion never approves content.</p>
    </form>}
  </section>;
}

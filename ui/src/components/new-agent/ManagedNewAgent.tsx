import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_ROLES, AGENT_ROLE_LABELS, type AgentRole } from "@paperclipai/shared";
import { agentsApi } from "../../api/agents";
import { useNavigate } from "@/lib/router";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { NativeSelect } from "../ui/select";

/**
 * New agent with admin-managed models: the owner names the agent and picks
 * its role. The server applies the managed adapter, the administrator's model
 * for that role and the company's SocialAgent AI connection.
 */
export function ManagedNewAgent({ companyId, adapterType }: { companyId: string; adapterType: "claude_local" | "codex_local" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("general");
  const [pendingApproval, setPendingApproval] = useState(false);
  const hire = useMutation({
    mutationFn: () => agentsApi.hire(companyId, { name: name.trim() || AGENT_ROLE_LABELS[role], role, adapterType, adapterConfig: {} }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      if (result.approval) setPendingApproval(true);
      else navigate("/agents/all");
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">New agent</h1>
        <p className="text-sm text-muted-foreground">
          Your administrator manages AI models. The agent runs on SocialAgent AI with the model set for its role.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="managed-agent-name">Name</Label>
        <Input id="managed-agent-name" value={name} placeholder={AGENT_ROLE_LABELS[role]} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="managed-agent-role">Role</Label>
        <NativeSelect id="managed-agent-role" value={role} onChange={(event) => setRole(event.target.value as AgentRole)}>
          {AGENT_ROLES.map((entry) => <option key={entry} value={entry}>{AGENT_ROLE_LABELS[entry]}</option>)}
        </NativeSelect>
      </div>
      {hire.error && <p role="alert" className="text-sm text-destructive">{hire.error instanceof Error ? hire.error.message : "Could not create the agent."}</p>}
      {pendingApproval && <p role="status" className="text-sm text-muted-foreground">The agent was requested and is waiting for board approval.</p>}
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={() => navigate("/agents/all")}>Cancel</Button>
        <Button type="button" disabled={hire.isPending || pendingApproval} onClick={() => hire.mutate()}>
          {hire.isPending ? "Creating…" : "Create agent"}
        </Button>
      </div>
    </div>
  );
}

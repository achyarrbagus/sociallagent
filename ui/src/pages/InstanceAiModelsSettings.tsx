import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { AGENT_ROLES, AGENT_ROLE_LABELS, type AgentRole, type ManagedAdapterModelPolicy } from "@paperclipai/shared";
import { managedAiApi } from "@/api/managed-ai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";

const EMPTY_POLICY: ManagedAdapterModelPolicy = { defaultModel: null, roles: {} };

function ModelSelect({ id, label, value, options, placeholder, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  options: { id: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <NativeSelect id={id} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {value && !options.some((option) => option.id === value) && <option value={value}>{value} (not offered by 9Router)</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </NativeSelect>
    </label>
  );
}

/**
 * Instance admin page for the managed 9Router gateway: the model each agent
 * role runs. Saving applies the models to every agent on the managed
 * connection, in every company. Company users cannot change models.
 */
export function InstanceAiModelsSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  useEffect(() => {
    setBreadcrumbs([{ label: "Settings", href: "/company/settings" }, { label: "AI models" }]);
  }, [setBreadcrumbs]);

  const settings = useQuery({ queryKey: queryKeys.instance.aiModels, queryFn: managedAiApi.getSettings });
  const enabled = settings.data?.enabled === true;
  const catalog = useQuery({ queryKey: queryKeys.instance.aiModelCatalog, queryFn: managedAiApi.catalog, enabled, staleTime: 60_000 });
  const agents = useQuery({ queryKey: queryKeys.instance.aiModelAgents, queryFn: managedAiApi.agents, enabled });

  const adapterType = settings.data?.adapterType ?? "claude_local";
  const [draft, setDraft] = useState<ManagedAdapterModelPolicy>(EMPTY_POLICY);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  useEffect(() => {
    if (settings.data) setDraft(settings.data.policy[settings.data.adapterType] ?? EMPTY_POLICY);
  }, [settings.data]);

  // A gateway lists every provider's models; show the ones that fit the agent first.
  const options = useMemo(() => {
    const family = adapterType === "claude_local" ? /claude/i : /gpt|codex/i;
    const all = catalog.data ?? [];
    return [...all.filter((m) => family.test(m.id)), ...all.filter((m) => !family.test(m.id))];
  }, [catalog.data, adapterType]);

  const save = useMutation({
    mutationFn: () => {
      const policy = { ...settings.data!.policy, [adapterType]: draft };
      return managedAiApi.updatePolicy(policy);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.instance.aiModels, result.settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instance.aiModelAgents });
      setSavedMessage(`Saved. ${result.updatedAgents} ${result.updatedAgents === 1 ? "agent was" : "agents were"} moved to the new models.`);
    },
    onError: () => setSavedMessage(null),
  });

  const setRole = (role: AgentRole, value: string) => {
    setSavedMessage(null);
    setDraft((current) => {
      const roles = { ...current.roles };
      if (value) roles[role] = value;
      else delete roles[role];
      return { ...current, roles };
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">AI models</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose the model each agent role runs through SocialAgent AI (9Router). Company users cannot change models or connect their own keys.
        </p>
      </div>

      {settings.error && <p role="alert" className="text-sm text-destructive">{settings.error instanceof Error ? settings.error.message : "Could not load AI model settings."}</p>}
      {settings.data && !enabled && (
        <Card className="block bg-transparent p-5 text-sm">
          <p className="font-medium">SocialAgent AI is not configured.</p>
          <p className="mt-1 text-muted-foreground">Set <code>SOCIALAGENT_9ROUTER_API_KEY</code> in the server environment and restart SocialAgent. Until then, users connect models themselves.</p>
        </Card>
      )}

      {enabled && settings.data && (
        <>
          <Card className="block space-y-5 bg-transparent p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{adapterType === "claude_local" ? "Claude Code" : "Codex"}</Badge>
              <span className="text-muted-foreground">{settings.data.baseUrl}</span>
            </div>
            {catalog.error && <p role="alert" className="text-sm text-destructive">{catalog.error instanceof Error ? catalog.error.message : "Could not load the 9Router model list."}</p>}
            <ModelSelect id="ai-model-default" label="Default model" value={draft.defaultModel ?? ""} options={options}
              placeholder="Use the server environment default" disabled={save.isPending}
              onChange={(value) => { setSavedMessage(null); setDraft((current) => ({ ...current, defaultModel: value || null })); }} />
            <div className="grid gap-4 sm:grid-cols-2">
              {AGENT_ROLES.map((role) => (
                <ModelSelect key={role} id={`ai-model-role-${role}`} label={AGENT_ROLE_LABELS[role]} value={draft.roles[role] ?? ""}
                  options={options} placeholder={`Default (${settings.data.effective[role] ?? "not set"})`} disabled={save.isPending}
                  onChange={(value) => setRole(role, value)} />
              ))}
            </div>
            <div className="flex items-center justify-end gap-3">
              {save.error && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "Could not save."}</p>}
              {savedMessage && <p role="status" className="text-sm text-muted-foreground">{savedMessage}</p>}
              <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save and apply"}
              </Button>
            </div>
          </Card>

          <Card className="block bg-transparent p-5">
            <h2 className="text-sm font-semibold">Agents</h2>
            {agents.error && <p role="alert" className="mt-2 text-sm text-destructive">{agents.error instanceof Error ? agents.error.message : "Could not load agents."}</p>}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Company</th>
                    <th className="py-2 pr-4 font-medium">Agent</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 font-medium">Connection</th>
                  </tr>
                </thead>
                <tbody>
                  {(agents.data ?? []).map((row) => (
                    <tr key={row.agentId} className="border-t border-border">
                      <td className="py-2 pr-4">{row.companyName}</td>
                      <td className="py-2 pr-4">{row.agentName}</td>
                      <td className="py-2 pr-4">{AGENT_ROLE_LABELS[row.role as AgentRole] ?? row.role}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.model ?? "—"}</td>
                      <td className="py-2">{row.managed ? <Badge variant="outline">SocialAgent AI</Badge> : <span className="text-muted-foreground">Own setup</span>}</td>
                    </tr>
                  ))}
                  {agents.data?.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">No agents yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

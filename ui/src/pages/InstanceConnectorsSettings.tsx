import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import type { ConnectorPolicySettings } from "@paperclipai/shared";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppLogo } from "./apps/AppLogo";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";

const connectorPolicyApi = {
  get: () => api.get<ConnectorPolicySettings>("/instance/settings/connectors"),
  update: (allowed: string[]) => api.put<ConnectorPolicySettings>("/instance/settings/connectors", { allowed }),
};

/**
 * Instance admin page: which Apps catalog connectors company users may
 * connect in SaaS mode. Nothing is allowed until the admin enables it.
 */
export function InstanceConnectorsSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  useEffect(() => {
    setBreadcrumbs([{ label: "Settings", href: "/company/settings" }, { label: "Connectors" }]);
  }, [setBreadcrumbs]);

  const settings = useQuery({ queryKey: queryKeys.instance.connectorPolicy, queryFn: connectorPolicyApi.get });
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  useEffect(() => {
    if (settings.data) setAllowed(new Set(settings.data.allowed));
  }, [settings.data]);

  const apps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (settings.data?.apps ?? []).filter((app) => !term || app.name.toLowerCase().includes(term) || app.slug.includes(term));
  }, [settings.data, search]);

  const save = useMutation({
    mutationFn: () => connectorPolicyApi.update([...allowed]),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.instance.connectorPolicy, result);
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
      setSavedMessage(`Saved. ${result.allowed.length} ${result.allowed.length === 1 ? "connector is" : "connectors are"} available to company users.`);
    },
  });

  const toggle = (slug: string, on: boolean) => {
    setSavedMessage(null);
    setAllowed((current) => {
      const next = new Set(current);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Connectors</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which apps company users can connect. Anything not checked is hidden from them and blocked on the server.
        </p>
      </div>

      {settings.error && <p role="alert" className="text-sm text-destructive">{settings.error instanceof Error ? settings.error.message : "Could not load connector settings."}</p>}
      {settings.data && !settings.data.enforced && (
        <Card className="block bg-transparent p-5 text-sm text-muted-foreground">
          This list applies once SocialAgent AI is configured (<code>SOCIALAGENT_9ROUTER_API_KEY</code>). Until then, users can connect any app.
        </Card>
      )}

      {settings.data && (
        <Card className="block space-y-4 bg-transparent p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input aria-label="Search connectors" placeholder="Search connectors" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-xs" />
            <div className="flex items-center gap-3">
              {savedMessage && <p role="status" className="text-sm text-muted-foreground">{savedMessage}</p>}
              {save.error && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "Could not save."}</p>}
              <span className="text-sm text-muted-foreground">{allowed.size} allowed</span>
              <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {apps.map((app) => (
              <li key={app.slug}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-accent/40">
                  <Checkbox aria-label={`Allow ${app.name}`} checked={allowed.has(app.slug)} onCheckedChange={(value) => toggle(app.slug, value === true)} className="mt-1" />
                  <AppLogo name={app.name} brandKey={app.slug} logoUrl={app.logoUrl || null} darkLogoUrl={app.darkLogoUrl ?? null} size={28} compact />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{app.name}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{app.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {apps.length === 0 && <p className="text-sm text-muted-foreground">No connectors match.</p>}
        </Card>
      )}
    </div>
  );
}

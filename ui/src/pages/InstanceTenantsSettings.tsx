import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import type { ManagedTenantRow } from "@paperclipai/shared";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";

const tenantsApi = {
  list: () => api.get<ManagedTenantRow[]>("/instance/tenants"),
  setBudget: (companyId: string, monthlyBudgetCents: number | null) =>
    api.put<ManagedTenantRow>(`/instance/tenants/${encodeURIComponent(companyId)}/budget`, { monthlyBudgetCents }),
  suspend: (companyId: string) => api.post<ManagedTenantRow>(`/instance/tenants/${encodeURIComponent(companyId)}/suspend`, {}),
  resume: (companyId: string) => api.post<ManagedTenantRow>(`/instance/tenants/${encodeURIComponent(companyId)}/resume`, {}),
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function statusLabel(row: ManagedTenantRow) {
  if (row.status === "active") return { label: "Active", tone: "outline" as const };
  if (row.pauseReason === "budget") return { label: "Budget used up", tone: "destructive" as const };
  if (row.status === "paused") return { label: "Suspended", tone: "secondary" as const };
  return { label: row.status, tone: "outline" as const };
}

function TenantRow({ row }: { row: ManagedTenantRow }) {
  const queryClient = useQueryClient();
  const [budget, setBudget] = useState(() => (row.monthlyBudgetCents / 100).toFixed(2));
  useEffect(() => setBudget((row.monthlyBudgetCents / 100).toFixed(2)), [row.monthlyBudgetCents]);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.instance.tenants });
  const saveBudget = useMutation({ mutationFn: (cents: number | null) => tenantsApi.setBudget(row.companyId, cents), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: () => row.status === "paused" && row.pauseReason === "manual" ? tenantsApi.resume(row.companyId) : tenantsApi.suspend(row.companyId), onSuccess: refresh });
  const status = statusLabel(row);
  const budgetValid = budget.trim() !== "" && Number.isFinite(Number(budget)) && Number(budget) >= 0;
  const used = row.monthlyBudgetCents > 0 ? Math.min(100, Math.round((row.spentThisMonthCents / row.monthlyBudgetCents) * 100)) : null;
  const suspended = row.status === "paused" && row.pauseReason === "manual";
  const error = saveBudget.error ?? toggle.error;
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pr-4">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-muted-foreground">{row.issuePrefix} · since {new Date(row.createdAt).toLocaleDateString()}</div>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error instanceof Error ? error.message : "Action failed."}</p>}
      </td>
      <td className="py-3 pr-4 text-sm">{row.memberCount}</td>
      <td className="py-3 pr-4 text-sm">{row.agentCount}</td>
      <td className="py-3 pr-4 text-sm">
        {usd(row.spentThisMonthCents)}
        {used !== null && <span className="text-xs text-muted-foreground"> · {used}%</span>}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <Input aria-label={`Monthly budget for ${row.name} in USD`} inputMode="decimal" className="w-24" value={budget} onChange={(event) => setBudget(event.target.value)} />
          <Button type="button" size="sm" variant="outline" disabled={!budgetValid || saveBudget.isPending} onClick={() => saveBudget.mutate(Math.round(Number(budget) * 100))}>Save</Button>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.budgetOverridden
            ? <button type="button" className="underline hover:text-foreground" onClick={() => saveBudget.mutate(null)}>Use default</button>
            : "Default"}
          {row.monthlyBudgetCents === 0 && " · no limit"}
        </div>
      </td>
      <td className="py-3 pr-4"><Badge variant={status.tone}>{status.label}</Badge></td>
      <td className="py-3">
        <Button type="button" size="sm" variant={suspended ? "outline" : "ghost"} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
          {toggle.isPending ? "…" : suspended ? "Resume" : "Suspend"}
        </Button>
      </td>
    </tr>
  );
}

/**
 * Instance admin view of every company on SocialAgent: people, agents, this
 * month's SocialAgent AI spend against its budget, per-company budget and
 * suspension.
 */
export function InstanceTenantsSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Settings", href: "/company/settings" }, { label: "Tenants" }]);
  }, [setBreadcrumbs]);
  const tenants = useQuery({ queryKey: queryKeys.instance.tenants, queryFn: tenantsApi.list });
  const rows = tenants.data ?? [];
  const totalSpent = rows.reduce((sum, row) => sum + row.spentThisMonthCents, 0);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Tenants</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Every company on SocialAgent with its SocialAgent AI spend this month. Set a company's own budget or suspend it; suspended companies stop running agents until you resume them.
        </p>
      </div>
      {tenants.error && <p role="alert" className="text-sm text-destructive">{tenants.error instanceof Error ? tenants.error.message : "Could not load tenants."}</p>}
      {tenants.data && (
        <Card className="block bg-transparent p-5">
          <p className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "company" : "companies"} · {usd(totalSpent)} spent this month</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">Members</th>
                  <th className="py-2 pr-4 font-medium">Agents</th>
                  <th className="py-2 pr-4 font-medium">Spent this month</th>
                  <th className="py-2 pr-4 font-medium">Monthly budget</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>{rows.map((row) => <TenantRow key={row.companyId} row={row} />)}</tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No companies yet.</p>}
        </Card>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, PauseCircle } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { Link, useLocation } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { dashboardApi } from "../api/dashboard";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { onboardingStepForCompany, shouldRouteAgentlessCompanyToOnboarding } from "../lib/onboarding-route";
import { claimOnboardingOffer } from "../lib/onboarding-auto-open";
import { queryKeys } from "../lib/queryKeys";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { EmptyState } from "../components/EmptyState";
import { InlineBanner } from "../components/InlineBanner";
import { Button } from "../components/ui/button";
import { TodayOverview } from "../components/TodayOverview";
import { PluginSlotOutlet } from "@/plugins/slots";
import { CreditBalance } from "@/components/CreditBalance";

export type PausedAgentBanner =
  | { kind: "imported"; pausedImportedAgentIds: string[] }
  | { kind: "all-paused" }
  | null;

/**
 * Which paused-agents banner the dashboard should show. Import-paused agents
 * get the specific banner with a bulk resume (they were parked by the import
 * safety default and stay parked until someone acts); otherwise a company
 * whose agents are ALL paused gets a generic explanation, because from the
 * outside it is indistinguishable from a broken company.
 */
export function derivePausedAgentBanner(agents: Agent[] | undefined): PausedAgentBanner {
  if (!agents || agents.length === 0) return null;
  const importedPaused = agents.filter(
    (agent) => agent.status === "paused" && agent.pauseReason === "import",
  );
  if (importedPaused.length > 0) {
    return { kind: "imported", pausedImportedAgentIds: importedPaused.map((agent) => agent.id) };
  }
  if (agents.every((agent) => agent.status === "paused")) return { kind: "all-paused" };
  return null;
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialogActions();
  const location = useLocation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agents = agentQuery.data;
  const shouldOpenOnboarding = shouldRouteAgentlessCompanyToOnboarding({
    pathname: location.pathname, agentsLoaded: agents !== undefined,
    agentsRefreshing: agentQuery.isFetching, agentCount: agents?.length ?? 0,
  });
  useEffect(() => {
    if (!shouldOpenOnboarding || !selectedCompanyId || !claimOnboardingOffer(selectedCompanyId)) return;
    openOnboarding({ companyId: selectedCompanyId, initialStep: onboardingStepForCompany() });
  }, [shouldOpenOnboarding, selectedCompanyId, openOnboarding]);
  useEffect(() => { setBreadcrumbs([{ label: "Hari ini" }]); }, [setBreadcrumbs]);

  const dashboardQueryKey = queryKeys.dashboard(selectedCompanyId!);
  const sharedDashboard = useSharedPollingQuery({ companyId: selectedCompanyId, resourceKey: "dashboard", queryKey: dashboardQueryKey, enabled: !!selectedCompanyId });
  const summary = useQuery({ queryKey: dashboardQueryKey, queryFn: () => dashboardApi.summary(selectedCompanyId!), enabled: !!selectedCompanyId });
  usePublishSharedQueryData(sharedDashboard, summary.data, summary.dataUpdatedAt);
  const resumeImportedAgents = useMutation({
    mutationFn: async () => {
      const targets = derivePausedAgentBanner(agents);
      if (!targets || targets.kind !== "imported") return;
      for (const agentId of targets.pausedImportedAgentIds) {
        try { await agentsApi.resume(agentId, selectedCompanyId ?? undefined); }
        catch { /* The banner retains agents that failed to resume. */ }
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) }),
      ]);
    },
  });
  if (!selectedCompanyId) return <EmptyState icon={LayoutDashboard}
    message={companies.length ? "Pilih organisasi untuk membuka ruang kerja agensi." : "Selamat datang di SocialAgent. Siapkan agensi dan tim AI pertamamu."}
    {...(!companies.length ? { action: "Mulai sekarang", onAction: openOnboarding } : {})} />;

  const pausedBanner = derivePausedAgentBanner(agents);
  const pausedImportedCount = pausedBanner?.kind === "imported" ? pausedBanner.pausedImportedAgentIds.length : 0;
  const budgets = summary.data?.budgets;
  const notices = <>
    {agentQuery.error && <InlineBanner tone="warning" title="Status tim AI belum bisa dimuat." actions={<Button size="sm" variant="ghost" onClick={() => void agentQuery.refetch()}>Coba lagi</Button>}>{agentQuery.error.message}</InlineBanner>}
    {summary.error && <InlineBanner tone="warning" title="Status anggaran belum bisa dimuat." actions={<Button size="sm" variant="ghost" onClick={() => void summary.refetch()}>Coba lagi</Button>}>{summary.error.message}</InlineBanner>}
    {pausedBanner?.kind === "imported" ? <InlineBanner tone="warning" icon={PauseCircle} title={`${pausedImportedCount} agen impor masih dijeda.`}
      actions={<Button size="sm" onClick={() => resumeImportedAgents.mutate()} disabled={resumeImportedAgents.isPending} data-testid="dashboard-resume-imported-agents">{resumeImportedAgents.isPending ? "Melanjutkan…" : "Lanjutkan semua"}</Button>}>
      Agen hasil impor perlu dilanjutkan sebelum bisa mengerjakan tugas.
    </InlineBanner> : pausedBanner?.kind === "all-paused" ? <InlineBanner tone="warning" icon={PauseCircle} title="Semua agen dijeda. Pekerjaan belum bisa berjalan."
      actions={<Button variant="ghost" size="sm" asChild><Link to="/agents">Lihat tim</Link></Button>}>Lanjutkan setidaknya satu agen untuk memulai pekerjaan.</InlineBanner> : null}
    {agents && !agentQuery.isFetching && agents.length === 0 && <InlineBanner tone="warning" title="Tim AI belum dibentuk."
      actions={<Button size="sm" onClick={() => openOnboarding({ initialStep: onboardingStepForCompany(), companyId: selectedCompanyId })}>Siapkan tim</Button>}>Tambahkan agen untuk membantu produksi konten.</InlineBanner>}
    {budgets && budgets.activeIncidents > 0 && <InlineBanner tone="warning" icon={PauseCircle} title={`${budgets.activeIncidents} masalah anggaran perlu ditinjau.`}
      actions={<Button variant="ghost" size="sm" asChild><Link to="/costs">Buka anggaran</Link></Button>}>{budgets.pausedAgents} agen dijeda · {budgets.pausedProjects} proyek dijeda · {budgets.pendingApprovals} persetujuan anggaran tertunda</InlineBanner>}
  </>;
  return <TodayOverview key={selectedCompanyId} companyId={selectedCompanyId} companyName={companies.find(company => company.id === selectedCompanyId)?.name ?? "Agensi kamu"}
    agents={agents} agentsError={agentQuery.error} notices={notices}>
    <CreditBalance companyId={selectedCompanyId} />
    <PluginSlotOutlet slotTypes={["dashboardWidget"]} context={{ companyId: selectedCompanyId }} className="grid gap-4 md:grid-cols-2" />
  </TodayOverview>;
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { agencyApi } from "../api/agency";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Link } from "../lib/router";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgencyForm, type AgencyFormState } from "../components/agency/AgencyForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Agency() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Clients & Brands" }]); }, [setBreadcrumbs]);
  if (!selectedCompanyId) return <EmptyState icon={Building2} message="Select an agency to view clients and brands." />;
  // Remount the entire editing scope so old drafts and mutation errors cannot
  // cross company boundaries when navigation changes the active company.
  return <AgencyWorkspace key={selectedCompanyId} companyId={selectedCompanyId} />;
}

function AgencyWorkspace({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AgencyFormState | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const directory = useQuery({ queryKey: queryKeys.agency(companyId), queryFn: () => agencyApi.directory(companyId) });
  const campaigns = useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () => projectsApi.list(companyId) });
  const save = useMutation({
    mutationFn: async ({ target, data }: { target: AgencyFormState; data: Record<string, unknown> }) => {
      if (target.kind === "client") return target.value ? agencyApi.updateClient(companyId, target.value.id, data) : agencyApi.createClient(companyId, data);
      if (target.kind === "brand") return target.value ? agencyApi.updateBrand(companyId, target.value.id, data) : agencyApi.createBrand(companyId, data);
      const { projectId, name, ...binding } = data;
      return typeof projectId === "string" && projectId ? projectsApi.update(projectId, binding, companyId) : projectsApi.create(companyId, { name, ...binding });
    },
    onSuccess: async () => {
      setForm(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agency(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId) }),
      ]);
    },
  });
  const open = (target: AgencyFormState) => { save.reset(); setForm(target); };
  if (directory.isLoading) return <PageSkeleton variant="list" />;
  if (directory.error || !directory.data) return <div role="alert" className="space-y-3"><p className="text-destructive">{directory.error?.message ?? "Unable to load agency."}</p><Button variant="outline" onClick={() => void directory.refetch()}>Retry</Button></div>;
  const { clients, brands, canManage } = directory.data;
  const projects = campaigns.data ?? [];
  const visibleClients = clients.filter(c => showArchived || !c.archivedAt);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Clients &amp; Brands</h1><p className="text-sm text-muted-foreground">Manage brand context and connect campaigns to the clients your agency serves.</p></div>
      {canManage && <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => open({ kind: "client" })} disabled={save.isPending}>New client</Button>
        <Button onClick={() => open({ kind: "brand" })} disabled={save.isPending || !clients.some(c => !c.archivedAt)}>New brand</Button>
      </div>}
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived</label>
    {campaigns.error && <p role="alert" className="text-sm text-destructive">Campaigns could not be loaded: {campaigns.error.message}</p>}
    {save.error && !form && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
    {form && <AgencyForm key={JSON.stringify(form)} form={form} clients={clients} brands={brands} projects={projects} pending={save.isPending} error={save.error?.message} onCancel={() => { save.reset(); setForm(null); }} onSave={data => save.mutate({ target: form, data })} />}
    {visibleClients.length === 0 && <EmptyState icon={Building2} message={clients.length ? "No active clients. Enable Show archived to view previous work." : "No clients yet. Add a client, then create their brand."} />}
    {visibleClients.map(client => <section key={client.id} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{client.name}</h2>{client.archivedAt && <Badge variant="secondary">Archived</Badge>}</div>
          {(client.contactName || client.contactEmail) && <p className="text-sm text-muted-foreground">{[client.contactName, client.contactEmail].filter(Boolean).join(" · ")}</p>}
          {client.description && <p className="whitespace-pre-wrap text-sm">{client.description}</p>}
        </div>
        {canManage && <div className="flex flex-wrap items-center gap-2">
          {!client.archivedAt && <Button size="sm" variant="outline" onClick={() => open({ kind: "brand", clientId: client.id })} disabled={save.isPending}>Add brand</Button>}
          <Button size="sm" variant="ghost" onClick={() => open({ kind: "client", value: client })} disabled={save.isPending}>Edit client</Button>
          <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ target: { kind: "client", value: client }, data: { archivedAt: client.archivedAt ? null : new Date().toISOString() } })}>{client.archivedAt ? "Restore client" : "Archive client"}</Button>
        </div>}
      </div>
      {brands.filter(b => b.clientId === client.id && (showArchived || !b.archivedAt)).map(brand => <article key={brand.id} className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1"><div className="flex items-center gap-2"><h3 className="font-medium">{brand.name}</h3>{brand.archivedAt && <Badge variant="secondary">Archived</Badge>}</div>
            <p className="text-sm text-muted-foreground">{brand.timezone}{brand.websiteUrl ? ` · ${brand.websiteUrl}` : ""}</p><Link to={`/content?brandId=${brand.id}`} className="text-sm underline">View content</Link></div>
          {canManage && <div className="flex flex-wrap items-center gap-2">
            {!brand.archivedAt && !client.archivedAt && <Button size="sm" variant="outline" disabled={save.isPending || campaigns.isLoading || !!campaigns.error} onClick={() => open({ kind: "campaign", brandId: brand.id })}>Add campaign</Button>}
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => open({ kind: "brand", value: brand })}>Edit brand</Button>
            <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ target: { kind: "brand", value: brand }, data: { archivedAt: brand.archivedAt ? null : new Date().toISOString() } })}>{brand.archivedAt ? "Restore brand" : "Archive brand"}</Button>
          </div>}
        </div>
        {brand.audience && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Audience: </span>{brand.audience}</p>}
        {brand.toneOfVoice && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Tone: </span>{brand.toneOfVoice}</p>}
        {brand.brief && <p className="whitespace-pre-wrap text-sm">{brand.brief}</p>}
        <div className="space-y-2"><h4 className="text-sm font-medium">Campaigns</h4>
          {projects.filter(p => p.brandId === brand.id).map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><Link className="underline underline-offset-4" to={`/projects/${p.urlKey || p.id}`}>{p.name}</Link>
            {canManage && <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ target: { kind: "campaign", brandId: brand.id }, data: { projectId: p.id, brandId: null } })}>Unlink</Button>}</div>)}
          {!campaigns.isLoading && !campaigns.error && !projects.some(p => p.brandId === brand.id) && <p className="text-sm text-muted-foreground">No campaigns linked yet.</p>}
        </div>
      </article>)}
      {!brands.some(b => b.clientId === client.id && (showArchived || !b.archivedAt)) && <p className="text-sm text-muted-foreground">No brands to show.</p>}
    </section>)}
  </div>;
}

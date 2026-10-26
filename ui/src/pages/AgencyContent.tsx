import { useEffect, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { AGENCY_CONTENT_STATUSES, createAgencyContentSchema, type AgencyContentDetail, type AgencyContentRevision, type DecideAgencyContent, type ListAgencyContent, type ReviseAgencyContent } from "@paperclipai/shared";
import { agencyContentApi } from "../api/agency-content";
import { agencyApi } from "../api/agency";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Link, useLocation, useNavigate, useParams } from "../lib/router";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ContentReview } from "../components/agency/ContentReview";
import { ContentEditor } from "../components/agency/ContentEditor";
import { ContentTasks } from "../components/agency/ContentTasks";
import { agencySelectClass } from "../components/agency/AgencyForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function AgencyContent() {
  const { selectedCompanyId } = useCompany(); const { contentId } = useParams(); const location = useLocation();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: "Content & Owner Review", href: "/content" }]); }, [setBreadcrumbs]);
  if (!selectedCompanyId) return <EmptyState icon={FileText} message="Select an agency to view content." />;
  const brandId = new URLSearchParams(location.search).get("brandId") ?? "";
  return contentId ? <ContentLoader key={`${selectedCompanyId}:${contentId}`} companyId={selectedCompanyId} id={contentId} /> : <ContentDirectory key={selectedCompanyId} companyId={selectedCompanyId} initialBrand={brandId} />;
}

function ContentDirectory({ companyId, initialBrand }: { companyId: string; initialBrand: string }) {
  const navigate = useNavigate(); const client = useQueryClient();
  const [filterBrand, setFilterBrand] = useState(initialBrand); const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false); const [brandId, setBrandId] = useState(initialBrand);
  const directory = useQuery({ queryKey: queryKeys.agency(companyId), queryFn: () => agencyApi.directory(companyId) });
  const projects = useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () => projectsApi.list(companyId) });
  const filters: ListAgencyContent = { ...(filterBrand ? { brandId: filterBrand } : {}), ...(status ? { status: status as ListAgencyContent["status"] } : {}) };
  const contents = useInfiniteQuery({ queryKey: ["agency-content", companyId, "list", filters], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => agencyContentApi.list(companyId, { ...filters, cursor: pageParam }), getNextPageParam: page => page.nextCursor ?? undefined });
  const create = useMutation({ mutationFn: (data: ReturnType<typeof createAgencyContentSchema.parse>) => agencyContentApi.create(companyId, data), onSuccess: async data => { await client.invalidateQueries({ queryKey: ["agency-content", companyId] }); navigate(`/content/${data.id}`); } });
  const activeBrands = (directory.data?.brands ?? []).filter(b => !b.archivedAt && directory.data?.clients.some(c => c.id === b.clientId && !c.archivedAt));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    create.mutate(createAgencyContentSchema.parse({ brandId, projectId: fields.get("projectId"), title: fields.get("title"), idea: fields.get("idea") }));
  }
  if (directory.isLoading || contents.isLoading) return <PageSkeleton variant="list" />;
  if (directory.error || contents.error) return <div role="alert" className="space-y-3"><p className="text-destructive">{directory.error?.message ?? contents.error?.message}</p><Button variant="outline" onClick={() => { void directory.refetch(); void contents.refetch(); }}>Retry</Button></div>;
  const items = contents.data?.pages.flatMap(page => page.items) ?? [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Content &amp; Owner Review</h1><p className="text-sm text-muted-foreground">Choose ideas, coordinate production, and review the exact final revision.</p></div>{directory.data?.canManage && <Button onClick={() => { create.reset(); setCreating(true); }}>New idea</Button>}</div>
    <div className="flex flex-wrap gap-3"><div className="space-y-2"><Label htmlFor="content-filter-brand">Brand</Label><select id="content-filter-brand" className={agencySelectClass} value={filterBrand} onChange={e => setFilterBrand(e.target.value)}><option value="">All brands</option>{directory.data?.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="content-filter-state">Status</Label><select id="content-filter-state" className={agencySelectClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">All content</option>{AGENCY_CONTENT_STATUSES.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></div><Button variant="outline" onClick={() => void contents.refetch()}>Refresh</Button></div>
    {creating && <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">New content idea</h2>{create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}{projects.error && <p role="alert" className="text-sm text-destructive">{projects.error.message}</p>}
      <fieldset className="space-y-4" disabled={create.isPending}>
        <div className="space-y-2"><Label htmlFor="new-content-brand">Brand</Label><select id="new-content-brand" className={agencySelectClass} value={brandId} required onChange={e => setBrandId(e.target.value)}><option value="" disabled>Select a brand</option>{activeBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="new-content-project">Campaign</Label><select key={brandId} id="new-content-project" name="projectId" required defaultValue="" className={agencySelectClass}><option value="" disabled>Select a campaign</option>{projects.data?.filter(p => p.brandId === brandId && !p.archivedAt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="text-sm text-muted-foreground">Create or attach campaigns in <Link to="/agency" className="underline">Clients &amp; Brands</Link>.</p></div>
        <div className="space-y-2"><Label htmlFor="new-content-title">Title</Label><Input id="new-content-title" name="title" required maxLength={200} /></div>
        <div className="space-y-2"><Label htmlFor="new-content-idea">Idea / audience insight</Label><Textarea id="new-content-idea" name="idea" maxLength={10000} /></div>
      </fieldset>
      <div className="flex items-center justify-between gap-3"><Button type="button" variant="outline" disabled={create.isPending} onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={create.isPending || projects.isLoading || !!projects.error}>Save idea</Button></div>
    </form>}
    {!items.length && <EmptyState icon={FileText} message="No content matches this view." />}
    {items.map(item => <Link key={item.id} to={`/content/${item.id}`} className="block space-y-2 rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">{item.title}</h2><Badge variant="secondary">{item.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">{directory.data?.brands.find(b => b.id === item.brandId)?.name ?? "Brand"} · Revision {item.revisionNumber}{item.approvalValid ? " · Owner approved" : ""}</p></Link>)}
    {contents.hasNextPage && <Button variant="outline" disabled={contents.isFetchingNextPage} onClick={() => void contents.fetchNextPage()}>Load more content</Button>}
  </div>;
}

function ContentLoader({ companyId, id }: { companyId: string; id: string }) {
  const query = useQuery({ queryKey: queryKeys.agencyContent.detail(companyId, id), queryFn: () => agencyContentApi.get(companyId, id) });
  if (query.isLoading) return <PageSkeleton variant="list" />;
  if (query.error || !query.data) return <div role="alert" className="space-y-3"><p className="text-destructive">{query.error?.message ?? "Content unavailable"}</p><Link to="/content" className="underline">Back to content</Link><Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  return <ContentDetailView data={query.data} />;
}

function ContentDetailView({ data }: { data: AgencyContentDetail }) {
  const client = useQueryClient();
  const [preview, setPreview] = useState(data.currentRevision);
  const [editor, setEditor] = useState<AgencyContentRevision | null>(null);
  const [editorToken, setEditorToken] = useState(0);
  const history = useInfiniteQuery({ queryKey: ["agency-content", data.companyId, "history", data.id], initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => agencyContentApi.history(data.companyId, data.id, pageParam), getNextPageParam: page => page.nextBefore ?? undefined });
  const attachments = useQuery({ queryKey: ["agency-content-assets", data.companyId, data.id, data.tasks.map(t => t.issueId), editorToken], enabled: !!editor, refetchOnWindowFocus: false,
    queryFn: async () => (await Promise.all(data.tasks.map(t => issuesApi.listAttachments(t.issueId)))).flat() });
  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: ["agency-content", data.companyId] }), client.invalidateQueries({ queryKey: ["agency-content-assets", data.companyId, data.id] })]);
  }
  const action = useMutation({
    mutationFn: (input: { kind: "decision"; decision: DecideAgencyContent } | { kind: "revision"; revision: ReviseAgencyContent } | { kind: "submit" }) => input.kind === "decision" ? agencyContentApi.decide(data.companyId, data.id, input.decision) : input.kind === "revision" ? agencyContentApi.revise(data.companyId, data.id, input.revision) : agencyContentApi.submit(data.companyId, data.id, preview.revisionNumber),
    onSuccess: async changed => { client.setQueryData(queryKeys.agencyContent.detail(data.companyId, data.id), changed); setPreview(changed.currentRevision); setEditor(null); await refresh(); },
    onError: async () => { await client.invalidateQueries({ queryKey: queryKeys.agencyContent.detail(data.companyId, data.id) }); },
  });
  const oldRevision = useMutation({ mutationFn: (number: number) => agencyContentApi.revision(data.companyId, data.id, number), onSuccess: setPreview, onError: () => void refresh() });
  const current = preview.revisionNumber === data.revisionNumber;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/content" className="text-sm underline">Back to content</Link><Badge variant="secondary">{data.status.replaceAll("_", " ")}</Badge></div>
    {(action.error || oldRevision.error) && <p role="alert" className="text-sm text-destructive">{action.error?.message ?? oldRevision.error?.message}</p>}
    <ContentReview data={data} preview={preview} pending={action.isPending || oldRevision.isPending} onLatest={() => { setPreview(data.currentRevision); action.reset(); }} onDecide={decision => action.mutate({ kind: "decision", decision })} />
    {data.canEdit && <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={action.isPending || !current} onClick={() => { action.reset(); setEditorToken(token => token + 1); setEditor(data.currentRevision); }}>Edit as new revision</Button>{data.status === "in_production" && <Button disabled={action.isPending || !current || !data.contextCurrent} onClick={() => action.mutate({ kind: "submit" })}>Submit to owner</Button>}</div>}
    {editor && (attachments.isLoading ? <PageSkeleton variant="list" /> : <ContentEditor seed={editor} currentNumber={data.revisionNumber} attachments={attachments.data ?? []} attachmentsError={attachments.error?.message} pending={action.isPending} onCancel={() => setEditor(null)} onSave={revision => action.mutate({ kind: "revision", revision })} />)}
    <ContentTasks data={data} onChanged={refresh} />
    <section className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">Revision history</h2>{history.error && <p role="alert" className="text-sm text-destructive">{history.error.message}</p>}
      <div className="flex flex-wrap gap-2">{history.data?.pages.flatMap(page => page.revisions).map(r => <Button key={r.revisionNumber} size="sm" variant={preview.revisionNumber === r.revisionNumber ? "secondary" : "outline"} disabled={oldRevision.isPending || action.isPending} onClick={() => oldRevision.mutate(r.revisionNumber)}>Revision {r.revisionNumber}</Button>)}</div>
      {history.hasNextPage && <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Older revisions</Button>}
    </section>
  </div>;
}

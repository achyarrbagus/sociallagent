import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { AgencyPublication } from "@paperclipai/shared";
import { agencyPublicationsApi, PLATFORM_LABELS } from "../api/agency-publications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { cn } from "../lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function statusVariant(entry: AgencyPublication) {
  if (entry.status === "failed" || (entry.status === "scheduled" && !entry.approvalCurrent)) return "destructive" as const;
  if (entry.status === "published") return "secondary" as const;
  return "outline" as const;
}

/** The days shown for a month, Monday first, padded to whole weeks. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return { days, from: start, to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42) };
}

function PublicationPanel({ entry, companyId, onClose }: { entry: AgencyPublication; companyId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [url, setUrl] = useState(entry.externalUrl ?? "");
  const [copied, setCopied] = useState(false);
  const refresh = () => void client.invalidateQueries({ queryKey: ["agency-publications", companyId] });
  const complete = useMutation({
    mutationFn: (status: "published" | "failed") => agencyPublicationsApi.complete(companyId, entry.id, status === "published"
      ? { status, externalUrl: url.trim() || null }
      : { status, failureReason: "Marked as not posted by the owner." }),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: () => agencyPublicationsApi.cancel(companyId, entry.id), onSuccess: refresh });
  const error = complete.error ?? cancel.error;
  return (
    <Card className="block space-y-3 bg-transparent p-5" aria-label="Scheduled post">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{entry.contentTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {entry.brandName} · {PLATFORM_LABELS[entry.platform]}{entry.accountLabel ? ` · ${entry.accountLabel}` : ""} · {new Date(entry.scheduledAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(entry)}>{entry.status === "scheduled" && !entry.approvalCurrent ? "needs approval" : entry.status}</Badge>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      {entry.status === "scheduled" && !entry.approvalCurrent && (
        <p role="alert" className="text-sm text-destructive">The content changed after it was scheduled. Approve the new revision and schedule it again; this post will not go out.</p>
      )}
      <p className="text-xs text-muted-foreground">
        {entry.dispatch === "agent" ? "The Publishing Coordinator posts it at the scheduled time through your connectors." : "You post this one yourself, then mark it here."}
      </p>
      {entry.caption && (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm">{entry.caption}</pre>
          <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(entry.caption ?? ""); setCopied(true); }}>{copied ? "Copied" : "Copy caption"}</Button>
        </div>
      )}
      {entry.assets.length > 0 && (
        <ul className="space-y-1 text-sm">
          {entry.assets.map((asset) => <li key={asset.assetId}><a className="underline" href={asset.contentPath} target="_blank" rel="noreferrer">{asset.filename ?? "Asset"}</a></li>)}
        </ul>
      )}
      {entry.externalUrl && <a className="text-sm underline" href={entry.externalUrl} target="_blank" rel="noreferrer">View post</a>}
      {entry.failureReason && <p className="text-sm text-destructive">{entry.failureReason}</p>}
      {entry.status === "scheduled" && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="min-w-0 flex-1 space-y-1 text-sm"><span className="font-medium">Post URL</span>
            <Input aria-label="Post URL" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <Button type="button" disabled={!entry.approvalCurrent || complete.isPending} onClick={() => complete.mutate("published")}>Mark published</Button>
          <Button type="button" variant="outline" disabled={complete.isPending} onClick={() => complete.mutate("failed")}>Not posted</Button>
          <Button type="button" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Action failed."}</p>}
      <Link to={`/content/${entry.contentId}`} className="text-sm underline">Open content</Link>
    </Card>
  );
}

/** Month view of every scheduled, published, failed and cancelled post. */
export function AgencyCalendar() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  useEffect(() => setBreadcrumbs([{ label: "Calendar" }]), [setBreadcrumbs]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(month), [month]);
  const publications = useQuery({
    queryKey: ["agency-publications", selectedCompanyId, grid.from.toISOString()],
    queryFn: () => agencyPublicationsApi.list(selectedCompanyId!, { from: grid.from.toISOString(), to: grid.to.toISOString() }),
    enabled: Boolean(selectedCompanyId),
  });
  const byDay = useMemo(() => {
    const map = new Map<string, AgencyPublication[]>();
    for (const entry of publications.data ?? []) {
      const key = dayKey(new Date(entry.scheduledAt));
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [publications.data]);
  const selected = publications.data?.find((entry) => entry.id === selectedId) ?? null;
  const today = dayKey(new Date());
  const shift = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="size-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Schedule approved content from its page in Content &amp; Review.</p>
      {publications.error && <p role="alert" className="text-sm text-destructive">{publications.error instanceof Error ? publications.error.message : "Could not load the calendar."}</p>}
      {selected && selectedCompanyId && <PublicationPanel entry={selected} companyId={selectedCompanyId} onClose={() => setSelectedId(null)} />}
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border text-sm">
        {WEEKDAYS.map((day) => <div key={day} className="border-b border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{day}</div>)}
        {grid.days.map((day) => {
          const entries = byDay.get(dayKey(day)) ?? [];
          const outside = day.getMonth() !== month.getMonth();
          return (
            <div key={day.toISOString()} className={cn("min-h-24 border-b border-r border-border p-1", outside && "bg-muted/40 text-muted-foreground")}>
              <div className={cn("mb-1 text-xs", dayKey(day) === today && "font-semibold text-foreground")}>{day.getDate()}</div>
              <div className="space-y-1">
                {entries.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)}
                    className={cn("block w-full truncate rounded-sm border px-1 py-0.5 text-left text-xs hover:bg-accent",
                      entry.status === "cancelled" ? "border-border text-muted-foreground line-through" : statusVariant(entry) === "destructive" ? "border-destructive text-destructive" : "border-border")}>
                    {new Date(entry.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} {PLATFORM_LABELS[entry.platform]} · {entry.contentTitle}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

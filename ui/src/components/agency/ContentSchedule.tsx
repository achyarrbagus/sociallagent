import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENCY_PUBLICATION_PLATFORMS, type AgencyContentDetail, type AgencyPublicationPlatform } from "@paperclipai/shared";
import { agencyPublicationsApi, PLATFORM_LABELS } from "../../api/agency-publications";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/select";
import { Link } from "@/lib/router";

/** Local `YYYY-MM-DDTHH:mm` an hour from now, for the datetime field. */
function defaultLocalTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Owner: put an approved content item on the calendar for one or more platforms. */
export function ContentSchedule({ data }: { data: AgencyContentDetail }) {
  const client = useQueryClient();
  const [platform, setPlatform] = useState<AgencyPublicationPlatform>("instagram");
  const [account, setAccount] = useState(data.currentRevision.targetAccount ?? "");
  const [when, setWhen] = useState(defaultLocalTime);
  const [dispatch, setDispatch] = useState<"agent" | "manual">("agent");
  const range = { from: new Date(Date.now() - 30 * 86_400_000).toISOString(), to: new Date(Date.now() + 366 * 86_400_000).toISOString() };
  const scheduled = useQuery({
    queryKey: ["agency-publications", data.companyId, "content", data.id],
    queryFn: async () => (await agencyPublicationsApi.list(data.companyId, range)).filter((entry) => entry.contentId === data.id),
  });
  const create = useMutation({
    mutationFn: () => agencyPublicationsApi.create(data.companyId, {
      contentId: data.id, platform, accountLabel: account.trim() || null, scheduledAt: new Date(when).toISOString(), dispatch,
    }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["agency-publications", data.companyId] }),
  });
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="content-schedule-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="content-schedule-heading" className="text-lg font-semibold">Schedule</h2>
        <Link to="/calendar" className="text-sm underline">Open calendar</Link>
      </div>
      <p className="text-sm text-muted-foreground">Post the approved revision {data.revisionNumber}. A new revision cancels its approval, so scheduled posts will not go out until it is approved again.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Platform</span>
          <NativeSelect aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value as AgencyPublicationPlatform)}>
            {AGENCY_PUBLICATION_PLATFORMS.map((value) => <option key={value} value={value}>{PLATFORM_LABELS[value]}</option>)}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Account</span>
          <Input aria-label="Account" placeholder="@brand" value={account} onChange={(event) => setAccount(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Date and time</span>
          <Input aria-label="Date and time" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Who posts</span>
          <NativeSelect aria-label="Who posts" value={dispatch} onChange={(event) => setDispatch(event.target.value as "agent" | "manual")}>
            <option value="agent">Publishing Coordinator (through your connectors)</option>
            <option value="manual">I post it myself</option>
          </NativeSelect>
        </label>
      </div>
      {create.error && <p role="alert" className="text-sm text-destructive">{create.error instanceof Error ? create.error.message : "Could not schedule."}</p>}
      <div className="flex justify-end"><Button type="button" disabled={!when || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Scheduling…" : "Schedule post"}</Button></div>
      {(scheduled.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {scheduled.data!.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-medium">{PLATFORM_LABELS[entry.platform]}</span>
              {entry.accountLabel && <span className="text-muted-foreground">{entry.accountLabel}</span>}
              <span className="text-muted-foreground">{new Date(entry.scheduledAt).toLocaleString()}</span>
              <Badge variant={entry.status === "failed" ? "destructive" : "secondary"}>{entry.status}</Badge>
              {entry.externalUrl && <a className="underline" href={entry.externalUrl} target="_blank" rel="noreferrer">View post</a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

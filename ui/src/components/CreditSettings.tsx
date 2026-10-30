import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreditSettings as Settings } from "@paperclipai/shared";
import { creditsApi } from "@/api/credits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const fields: Array<{ key: keyof Settings; label: string }> = [
  { key: "allowance", label: "Monthly credits" },
  { key: "input", label: "Input credits" },
  { key: "cachedInput", label: "Cached input credits" },
  { key: "output", label: "Output credits" },
];
export function CreditSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["instance", "credits"], queryFn: creditsApi.settings });
  const [draft, setDraft] = useState<Record<keyof Settings, string> | null>(null);
  useEffect(() => { if (query.data) setDraft({ allowance: String(query.data.allowance), input: String(query.data.input), cachedInput: String(query.data.cachedInput), output: String(query.data.output) }); }, [query.data]);
  const save = useMutation({ mutationFn: (settings: Settings) => creditsApi.updateSettings(settings), onSuccess: data => { queryClient.setQueryData(["instance", "credits"], data); void queryClient.invalidateQueries({ queryKey: ["credits"] }); } });
  const invalid = !draft || Object.values(draft).some(value => value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1_000_000);
  return <Card className="block space-y-4 bg-transparent p-5">
    <div><h2 className="text-sm font-semibold">Customer credits</h2><p className="text-sm text-muted-foreground">Set the monthly credits for each organization and credits per 1,000 tokens. Changes apply to new runs; active runs keep their rates.</p><p className="text-xs text-muted-foreground">Each run is charged once from its final token counts and rounded up to the nearest 0.000001 credit. Credits are what organizations consume; your provider cost is tracked separately under Costs.</p></div>
    {query.isLoading && <p className="text-sm text-muted-foreground">Loading credit settings…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load credit settings."}</p>}
    {draft && <><p className="text-xs text-muted-foreground">Credits per 1,000 tokens</p><div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label }) => <label key={key} className="block space-y-1 text-sm"><span className="font-medium">{label}</span><Input aria-label={label} inputMode="decimal" value={draft[key]} disabled={save.isPending} onChange={event => setDraft(current => current && { ...current, [key]: event.target.value })} /></label>)}</div>
      <div className="flex items-center justify-end gap-3">{save.error && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "Could not save credit settings."}</p>}{save.isSuccess && <p role="status" className="text-sm text-muted-foreground">Credit settings saved.</p>}<Button disabled={invalid || save.isPending} onClick={() => { if (draft) save.mutate({ allowance: Number(draft.allowance), input: Number(draft.input), cachedInput: Number(draft.cachedInput), output: Number(draft.output) }); }}>{save.isPending ? "Saving…" : "Save credits"}</Button></div></>}
  </Card>;
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreditSettings } from "@paperclipai/shared";
import { creditsApi } from "@/api/credits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const fields: Array<{ key: keyof CreditSettings; label: string }> = [{ key: "allowance", label: "Monthly credits" }, { key: "input", label: "Input credits" }, { key: "cachedInput", label: "Cached input credits" }, { key: "output", label: "Output credits" }];
export function TenantCreditSettings({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["instance", "credits", companyId], queryFn: () => creditsApi.companySettings(companyId), enabled: open });
  const [draft, setDraft] = useState<Record<keyof CreditSettings, string> | null>(null);
  useEffect(() => { if (query.data) setDraft({ allowance: String(query.data.allowance), input: String(query.data.input), cachedInput: String(query.data.cachedInput), output: String(query.data.output) }); }, [query.data]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ["instance", "credits", companyId] }); void client.invalidateQueries({ queryKey: ["credits", companyId] }); };
  const save = useMutation({ mutationFn: (values: CreditSettings) => creditsApi.setCompany(companyId, values), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => creditsApi.resetCompany(companyId), onSuccess: refresh });
  const invalid = !draft || Object.values(draft).some(value => value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1_000_000);
  const error = query.error ?? save.error ?? reset.error;
  return <div className="space-y-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(value => !value)}>{open ? "Close credits" : "Set credits"}</Button>
    {open && <div className="space-y-2"><p className="text-xs text-muted-foreground">{query.data?.override ? "Custom settings" : "Using instance defaults"}. Rates are per 1,000 tokens.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error instanceof Error ? error.message : "Could not update credits."}</p>}
      {draft && <><div className="grid gap-2">{fields.map(({ key, label }) => <label key={key} className="space-y-1 text-xs"><span>{label}</span><Input aria-label={label} inputMode="decimal" value={draft[key]} onChange={event => setDraft(current => current && { ...current, [key]: event.target.value })} /></label>)}</div>
        <div className="flex items-center gap-2"><Button type="button" size="sm" disabled={invalid || save.isPending || reset.isPending} onClick={() => { if (draft) save.mutate({ allowance: Number(draft.allowance), input: Number(draft.input), cachedInput: Number(draft.cachedInput), output: Number(draft.output) }); }}>Save credits</Button>{query.data?.override && <Button type="button" size="sm" variant="ghost" disabled={save.isPending || reset.isPending} onClick={() => reset.mutate()}>Use defaults</Button>}</div></>}
    </div>}
  </div>;
}

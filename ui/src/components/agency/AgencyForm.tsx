import { useState, type FormEvent } from "react";
import type { AgencyBrand, AgencyClient, Project } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AgencyFormState =
  | { kind: "client"; value?: AgencyClient }
  | { kind: "brand"; value?: AgencyBrand; clientId?: string }
  | { kind: "campaign"; brandId: string };

export const agencySelectClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function AgencyForm({ form, clients, brands, projects, pending, error, onCancel, onSave }: {
  form: AgencyFormState;
  clients: AgencyClient[];
  brands: AgencyBrand[];
  projects: Project[];
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const value = form.kind === "campaign" ? undefined : form.value;
  const brand = form.kind === "brand" ? form.value : undefined;
  const client = form.kind === "client" ? form.value : undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const read = (key: string) => String(fields.get(key) ?? "").trim();
    const optional = (key: string) => read(key) || null;
    if (form.kind === "client") onSave({ name: read("name"), description: optional("description"), contactName: optional("contactName"), contactEmail: optional("contactEmail") });
    if (form.kind === "brand") onSave({ name: read("name"), clientId: read("clientId"), websiteUrl: optional("websiteUrl"), audience: optional("audience"), toneOfVoice: optional("toneOfVoice"), brief: optional("brief"), timezone: read("timezone") });
    if (form.kind === "campaign") onSave({ name: read("name"), brandId: read("brandId") || null, projectId });
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">{value ? "Edit" : "New"} {form.kind}</h2>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <fieldset disabled={pending} className="space-y-4">
        {form.kind === "campaign" && <div className="space-y-2">
          <Label htmlFor="agency-project">Project</Label>
          <select id="agency-project" className={agencySelectClass} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">Create a new campaign</option>
            {projects.filter(p => !p.archivedAt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>}
        {!projectId && <div className="space-y-2">
          <Label htmlFor="agency-name">Name</Label>
          <Input id="agency-name" name="name" required maxLength={200} defaultValue={value?.name ?? ""} />
        </div>}
        {form.kind === "client" && <>
          <div className="space-y-2"><Label htmlFor="agency-contact-name">Contact name</Label><Input id="agency-contact-name" name="contactName" maxLength={200} defaultValue={client?.contactName ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-contact-email">Contact email</Label><Input id="agency-contact-email" name="contactEmail" type="email" maxLength={320} defaultValue={client?.contactEmail ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-description">Description</Label><Textarea id="agency-description" name="description" maxLength={5000} defaultValue={client?.description ?? ""} /></div>
        </>}
        {form.kind === "brand" && <>
          <div className="space-y-2"><Label htmlFor="agency-client">Client</Label>
            <select id="agency-client" name="clientId" required className={agencySelectClass} defaultValue={brand?.clientId ?? form.clientId ?? ""}>
              <option value="" disabled>Select a client</option>
              {clients.filter(c => !c.archivedAt || c.id === brand?.clientId).map(c => <option key={c.id} value={c.id}>{c.name}{c.archivedAt ? " (archived)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="agency-website">Website</Label><Input id="agency-website" name="websiteUrl" type="url" maxLength={2000} defaultValue={brand?.websiteUrl ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-audience">Audience</Label><Textarea id="agency-audience" name="audience" maxLength={5000} defaultValue={brand?.audience ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-tone">Tone of voice</Label><Textarea id="agency-tone" name="toneOfVoice" maxLength={5000} defaultValue={brand?.toneOfVoice ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-brief">Brand brief</Label><Textarea id="agency-brief" name="brief" maxLength={20000} defaultValue={brand?.brief ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="agency-timezone">Timezone</Label><Input id="agency-timezone" name="timezone" required defaultValue={brand?.timezone ?? "Asia/Jakarta"} /><p className="text-sm text-muted-foreground">For example, Asia/Jakarta. Keep passwords and API keys in Connections.</p></div>
        </>}
        {form.kind === "campaign" && <div className="space-y-2"><Label htmlFor="agency-brand">Brand</Label>
          <select id="agency-brand" name="brandId" className={agencySelectClass} defaultValue={form.brandId}>
            <option value="">No brand (internal project)</option>
            {brands.filter(b => !b.archivedAt && clients.some(c => c.id === b.clientId && !c.archivedAt)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>}
      </fieldset>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

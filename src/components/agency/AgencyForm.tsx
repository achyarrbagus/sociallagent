"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBrand, saveCampaign, saveClient, type FormState } from "@/lib/agency/actions";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/lib/agency/schemas";
import type { BrandRow, CampaignRow, ClientRow } from "@/lib/agency/types";

export type AgencyFormTarget =
  | { kind: "client"; value?: ClientRow }
  | { kind: "brand"; value?: BrandRow; clientId?: string }
  | { kind: "campaign"; value?: CampaignRow; brandId?: string };

export const agencySelectClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

const KIND_LABELS = { client: "klien", brand: "brand", campaign: "campaign" } as const;

const toDateInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function AgencyForm({ slug, form, clients, brands, onDone }: {
  slug: string;
  form: AgencyFormTarget;
  clients: ClientRow[];
  brands: BrandRow[];
  onDone: () => void;
}) {
  const id = form.value?.id ?? null;
  const action = form.kind === "client" ? saveClient.bind(null, slug, id)
    : form.kind === "brand" ? saveBrand.bind(null, slug, id)
    : saveCampaign.bind(null, slug, id);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  useEffect(() => { if (state.ok) onDone(); }, [state, onDone]);
  const fieldError = (key: string) => state.fieldErrors?.[key]?.[0];

  const client = form.kind === "client" ? form.value : undefined;
  const brand = form.kind === "brand" ? form.value : undefined;
  const campaign = form.kind === "campaign" ? form.value : undefined;

  return (
    <form action={formAction} className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">{form.value ? "Ubah" : "Tambah"} {KIND_LABELS[form.kind]}</h2>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <fieldset disabled={pending} className="space-y-4">
        <Field id="agency-name" label="Nama" error={fieldError("name")}>
          <Input id="agency-name" name="name" required maxLength={200} defaultValue={form.value?.name ?? ""} />
        </Field>

        {form.kind === "client" && <>
          <Field id="agency-contact-name" label="Nama kontak"><Input id="agency-contact-name" name="contactName" maxLength={200} defaultValue={client?.contactName ?? ""} /></Field>
          <Field id="agency-contact-email" label="Email kontak" error={fieldError("contactEmail")}><Input id="agency-contact-email" name="contactEmail" type="email" maxLength={320} defaultValue={client?.contactEmail ?? ""} /></Field>
          <Field id="agency-description" label="Deskripsi"><Textarea id="agency-description" name="description" maxLength={5000} defaultValue={client?.description ?? ""} /></Field>
        </>}

        {form.kind === "brand" && <>
          <Field id="agency-client" label="Klien" error={fieldError("clientId")}>
            <select id="agency-client" name="clientId" required className={agencySelectClass} defaultValue={brand?.clientId ?? form.clientId ?? ""}>
              <option value="" disabled>Pilih klien</option>
              {clients.filter((c) => !c.archivedAt || c.id === brand?.clientId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.archivedAt ? " (diarsipkan)" : ""}</option>)}
            </select>
          </Field>
          <Field id="agency-website" label="Website" error={fieldError("websiteUrl")}><Input id="agency-website" name="websiteUrl" type="url" maxLength={2000} defaultValue={brand?.websiteUrl ?? ""} /></Field>
          <Field id="agency-audience" label="Audiens"><Textarea id="agency-audience" name="audience" maxLength={5000} defaultValue={brand?.audience ?? ""} /></Field>
          <Field id="agency-tone" label="Tone of voice"><Textarea id="agency-tone" name="toneOfVoice" maxLength={5000} defaultValue={brand?.toneOfVoice ?? ""} /></Field>
          <Field id="agency-brief" label="Brand brief"><Textarea id="agency-brief" name="brief" maxLength={20000} defaultValue={brand?.brief ?? ""} /></Field>
          <Field id="agency-timezone" label="Zona waktu" hint="Contoh: Asia/Jakarta. Dipakai untuk jadwal posting.">
            <Input id="agency-timezone" name="timezone" required defaultValue={brand?.timezone ?? "Asia/Jakarta"} />
          </Field>
        </>}

        {form.kind === "campaign" && <>
          <Field id="agency-brand" label="Brand" error={fieldError("brandId")}>
            <select id="agency-brand" name="brandId" required className={agencySelectClass} defaultValue={campaign?.brandId ?? form.brandId ?? ""}>
              <option value="" disabled>Pilih brand</option>
              {brands.filter((b) => !b.archivedAt || b.id === campaign?.brandId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field id="agency-objective" label="Tujuan campaign"><Textarea id="agency-objective" name="objective" maxLength={5000} defaultValue={campaign?.objective ?? ""} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="agency-status" label="Status">
              <select id="agency-status" name="status" className={agencySelectClass} defaultValue={campaign?.status ?? "planned"}>
                {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field id="agency-start" label="Mulai" error={fieldError("startDate")}><Input id="agency-start" name="startDate" type="date" defaultValue={toDateInput(campaign?.startDate)} /></Field>
            <Field id="agency-target" label="Target selesai" error={fieldError("targetDate")}><Input id="agency-target" name="targetDate" type="date" defaultValue={toDateInput(campaign?.targetDate)} /></Field>
          </div>
        </>}
      </fieldset>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>Batal</Button>
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</Button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

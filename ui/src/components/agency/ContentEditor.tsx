import type { FormEvent } from "react";
import { AGENCY_CONTENT_FORMATS, type AgencyContentRevision, type IssueAttachment, type ReviseAgencyContent } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { agencySelectClass } from "./AgencyForm";

export function ContentEditor({ seed, currentNumber, attachments, pending, attachmentsError, onSave, onCancel }: {
  seed: AgencyContentRevision; currentNumber: number; attachments: IssueAttachment[]; pending: boolean; attachmentsError?: string;
  onSave: (input: ReviseAgencyContent) => void; onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const text = (key: string) => String(fields.get(key) ?? "").trim();
    onSave({ expectedRevisionNumber: seed.revisionNumber, title: text("title"), idea: text("idea"), hook: text("hook"), caption: text("caption"), script: text("script"), cta: text("cta"), targetAccount: text("targetAccount"), format: text("format") as ReviseAgencyContent["format"], attachmentIds: fields.getAll("attachmentIds").map(String) });
  }
  const stale = currentNumber !== seed.revisionNumber;
  return <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">New revision from version {seed.revisionNumber}</h2>
    {stale && <p role="alert" className="text-sm text-destructive">A newer revision exists. Cancel this editor and review the latest version before editing.</p>}
    <fieldset disabled={pending || stale} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="content-title">Title</Label><Input id="content-title" name="title" defaultValue={seed.title} required maxLength={200} /></div>
      {([['idea', 'Idea / audience insight', 10000], ['hook', 'Hook', 5000], ['caption', 'Caption', 20000], ['script', 'Script', 20000], ['cta', 'CTA', 2000]] as const).map(([key, label, max]) => <div key={key} className="space-y-2"><Label htmlFor={`content-${key}`}>{label}</Label><Textarea id={`content-${key}`} name={key} defaultValue={seed[key]} maxLength={max} /></div>)}
      <div className="space-y-2"><Label htmlFor="content-format">Format</Label><select id="content-format" name="format" className={agencySelectClass} defaultValue={seed.format}>{AGENCY_CONTENT_FORMATS.map(format => <option key={format} value={format}>{format}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="content-account">Target account / handle</Label><Input id="content-account" name="targetAccount" defaultValue={seed.targetAccount} maxLength={300} /><p className="text-sm text-muted-foreground">Planning reference only. Provider account authorization belongs to the later publishing integration.</p></div>
      <div className="space-y-2"><h3 className="text-sm font-medium">Production task attachments</h3>
        {attachmentsError && <p role="alert" className="text-sm text-destructive">{attachmentsError}</p>}
        {!attachments.length && <p className="text-sm text-muted-foreground">Upload assets on a linked production task, then reload this editor.</p>}
        {attachments.map(asset => <label key={asset.id} className="flex items-center gap-2 text-sm"><input name="attachmentIds" type="checkbox" value={asset.id} defaultChecked={seed.assets.some(a => a.attachmentId === asset.id)} />{asset.originalFilename ?? "Attachment"}</label>)}
      </div>
    </fieldset>
    <div className="flex items-center justify-between gap-3"><Button variant="outline" type="button" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || stale || !!attachmentsError}>{pending ? "Saving…" : "Save new revision"}</Button></div>
  </form>;
}

import { useState } from "react";
import type { AgencyContentDetail, AgencyContentRevision, DecideAgencyContent } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function ContentReview({ data, preview, pending, onDecide, onLatest }: {
  data: AgencyContentDetail; preview: AgencyContentRevision; pending: boolean;
  onDecide: (decision: DecideAgencyContent) => void; onLatest: () => void;
}) {
  const [note, setNote] = useState("");
  const current = data.revisionNumber === preview.revisionNumber;
  const decide = (decision: DecideAgencyContent["decision"]) => onDecide({ expectedRevisionNumber: preview.revisionNumber, decision, note });
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{preview.title}</h2><Badge variant="secondary">Revision {preview.revisionNumber}</Badge></div>
    {!current && <div className="space-y-2"><p role="status" className="text-sm text-muted-foreground">You are viewing an older revision. Review the latest version before taking action.</p><Button variant="outline" onClick={onLatest}>Review latest revision</Button></div>}
    {!data.contextCurrent && <p role="status" className="text-sm text-destructive">Brand, client or campaign context changed. Restore archived context if needed, then save a fresh revision with current guidance before review.</p>}
    <p className="text-sm text-muted-foreground">{preview.format} · {preview.targetAccount || "Target account not specified"}</p>
    {[['Idea', preview.idea], ['Hook', preview.hook], ['Caption', preview.caption], ['Script', preview.script], ['CTA', preview.cta]].filter(([, value]) => value).map(([title, value]) => <div key={title} className="space-y-1"><h3 className="text-sm font-medium">{title}</h3><p className="whitespace-pre-wrap break-words text-sm">{value}</p></div>)}
    <div className="space-y-3">{preview.assets.map(asset => <div key={asset.assetId} className="space-y-2">
      {asset.contentType.startsWith("image/") && <img src={`/api/assets/${encodeURIComponent(asset.assetId)}/content`} alt={asset.filename} className="max-h-80 max-w-full rounded-md object-contain" />}
      <a className="text-sm underline underline-offset-4" href={`/api/assets/${encodeURIComponent(asset.assetId)}/content`} target="_blank" rel="noopener noreferrer">Open {asset.filename}</a>
      <p className="break-all text-xs text-muted-foreground">SHA-256: {asset.sha256}</p>
    </div>)}</div>
    {data.canManage && <div className="space-y-3 border-t pt-4">
      <div className="space-y-2"><Label htmlFor="content-review-note">Owner feedback</Label><Textarea id="content-review-note" value={note} maxLength={5000} onChange={e => setNote(e.target.value)} disabled={pending} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["idea", "in_production", "awaiting_owner", "changes_requested"].includes(data.status) && <Button variant="outline" disabled={pending || !current} onClick={() => decide("reject")}>Reject</Button>}
          {["awaiting_owner", "approved"].includes(data.status) && <Button variant="outline" disabled={pending || !current || !note.trim()} onClick={() => decide("request_changes")}>Request changes</Button>}
        </div>
        {data.status === "idea" && <Button disabled={pending || !current} onClick={() => decide("select_idea")}>Select idea for production</Button>}
        {data.status === "awaiting_owner" && <Button disabled={pending || !current || !data.contextCurrent} onClick={() => decide("approve")}>Approve content</Button>}
      </div>
      <p className="text-sm text-muted-foreground">Selecting an idea starts production. Final approval applies to this content revision and does not publish it.</p>
    </div>}
    {preview.decisions.length > 0 && <div className="space-y-2 border-t pt-4"><h3 className="text-sm font-medium">Owner decisions for this revision</h3>{preview.decisions.map(decision => <p key={decision.id} className="whitespace-pre-wrap text-sm">{decision.decision.replaceAll("_", " ")} · {decision.decidedByUserId}{decision.note ? ` — ${decision.note}` : ""}</p>)}</div>}
  </section>;
}

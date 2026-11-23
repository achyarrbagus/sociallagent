"use client";

import { useCallback, useState } from "react";
import { AgencyForm } from "@/components/agency/AgencyForm";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/agency/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BrandRow, CampaignRow, ClientRow } from "@/lib/agency/types";

const formatDate = (d: Date | null) => d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "Belum ditentukan";

export function CampaignDetail({ slug, canManage, campaign, brands }: {
  slug: string;
  canManage: boolean;
  campaign: CampaignRow & { brand: BrandRow & { client: ClientRow } };
  brands: BrandRow[];
}) {
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => setEditing(false), []);
  if (editing) return <AgencyForm slug={slug} form={{ kind: "campaign", value: campaign }} clients={[]} brands={brands} onDone={close} />;
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{campaign.name}</h1><Badge variant="outline">{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge></div>
        <p className="text-sm text-muted-foreground">{campaign.brand.name} · {campaign.brand.client.name}</p>
      </div>
      {canManage && <Button variant="outline" onClick={() => setEditing(true)}>Ubah campaign</Button>}
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">Mulai</dt><dd className="text-muted-foreground">{formatDate(campaign.startDate)}</dd></div>
      <div><dt className="font-medium">Target selesai</dt><dd className="text-muted-foreground">{formatDate(campaign.targetDate)}</dd></div>
    </dl>
    <div className="space-y-1 text-sm"><h2 className="font-medium">Tujuan</h2><p className="whitespace-pre-wrap text-muted-foreground">{campaign.objective || "Belum ada tujuan yang ditulis."}</p></div>
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      Konten, jadwal posting, dan tim AI untuk campaign ini hadir di fase berikutnya.
    </div>
  </section>;
}

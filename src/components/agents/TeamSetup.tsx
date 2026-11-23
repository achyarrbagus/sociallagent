"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { installAgencyTeam } from "@/lib/agents/actions";
import { AGENCY_CORE_TEAM } from "@/lib/agents/team";
import { AgentAvatar } from "./AgentAvatar";

/** Director name + one-click install of the Agency Core team. Used by onboarding and the Team page. */
export function TeamSetup({ slug, onDone }: { slug: string; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("Agency Director");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await installAgencyTeam(slug, name);
    setPending(false);
    if (!result.ok) return setError(result.error);
    if (onDone) onDone(); else router.refresh();
  }
  return <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
    <div className="space-y-2"><Label htmlFor="director-name">Nama Agency Director</Label>
      <Input id="director-name" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} placeholder="mis. Agency Director" />
      <p className="text-sm text-muted-foreground">Director memimpin {AGENCY_CORE_TEAM.length - 1} spesialis: strategi, produksi, dan publikasi.</p>
    </div>
    <ul className="flex flex-wrap gap-2" aria-label="Anggota tim">{AGENCY_CORE_TEAM.map((m) => <li key={m.slug} className="flex items-center gap-2 rounded-full border bg-background px-2 py-1 text-xs">
      <AgentAvatar paletteId={m.paletteId} name={m.name} size={24} />{m.slug === "agency-director" ? name || m.name : m.name}
    </li>)}</ul>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={pending || !name.trim()}>{pending ? "Menyiapkan tim…" : "Siapkan tim"}</Button>
  </form>;
}

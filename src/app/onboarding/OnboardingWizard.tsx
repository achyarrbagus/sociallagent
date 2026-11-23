"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AgentCharacter } from "@/components/agents/AgentCharacter";
import { SocialAgentLockup } from "@/components/brand/SocialAgentLockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CharacterState } from "@/lib/agent-appearance";
import { installAgencyTeam } from "@/lib/agents/actions";
import { AGENCY_CORE_TEAM } from "@/lib/agents/team";
import { authClient } from "@/lib/auth-client";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

const STEPS = ["Nama agensi", "Agent pertama", "Menyiapkan agensi", "Siap"] as const;
const DIRECTOR_PALETTE = AGENCY_CORE_TEAM[0].paletteId;

type Agency = { slug: string; name: string };

export function OnboardingWizard({ resume }: { resume: Agency | null }) {
  const [step, setStep] = useState(resume ? 1 : 0);
  const [agency, setAgency] = useState<Agency | null>(resume);
  const [director, setDirector] = useState("Agency Director");
  const region = useRef<HTMLDivElement>(null);
  const mood: CharacterState = step === 1 ? "listening" : step === 2 ? "working" : step === 3 ? "success" : "idle";

  return <div ref={region} className="socialagent-onboarding fixed inset-0 z-50 flex flex-col overflow-y-auto">
    <header className="flex items-center justify-between gap-3 p-6">
      <SocialAgentLockup className="h-5 w-auto" />
      {agency && step < 3 && <Link href={`/${agency.slug}/dashboard`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">Lewati untuk sekarang</Link>}
    </header>
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 pb-12 text-center">
      <Stepper step={step} />
      {step > 0 && <AgentCharacter paletteId={DIRECTOR_PALETTE} name={director} size={128} state={mood} trackingRegion={region} trackingScope="page" label={director} />}
      {step === 0 && <AgencyStep onDone={(a) => { setAgency(a); setStep(1); }} />}
      {step === 1 && <DirectorStep name={director} onChange={setDirector} onNext={() => setStep(2)} />}
      {step === 2 && agency && <InstallStep slug={agency.slug} director={director} onDone={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && agency && <ReadyStep slug={agency.slug} director={director} />}
    </main>
  </div>;
}

function Stepper({ step }: { step: number }) {
  return <div className="flex flex-col items-center gap-2">
    <ol className="flex gap-2" aria-label="Langkah onboarding">{STEPS.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined}
      className={cn("h-2 w-10 rounded-full border border-border", i <= step ? "bg-[var(--sa-coral)]" : "bg-card")}><span className="sr-only">{label}</span></li>)}</ol>
    <p className="sr-only" aria-live="polite">Langkah {step + 1} dari {STEPS.length}: {STEPS[step]}</p>
  </div>;
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="space-y-2"><h1 className="text-2xl font-semibold">{title}</h1>{children && <p className="text-sm text-muted-foreground">{children}</p>}</div>;
}

function AgencyStep({ onDone }: { onDone: (agency: Agency) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.organization.create({ name: name.trim(), slug });
    if (result.error) {
      setPending(false);
      return setError(result.error.message ?? "Agensi belum bisa dibuat.");
    }
    await authClient.organization.setActive({ organizationId: result.data.id });
    onDone({ slug: result.data.slug, name: result.data.name });
  }
  return <form onSubmit={submit} className="w-full space-y-5">
    <Heading title="Apa nama agensi kamu?">Agensi adalah workspace untuk klien, brand, campaign, dan tim AI kamu.</Heading>
    <div className="space-y-2 text-left"><Label htmlFor="agency-name">Nama agensi</Label>
      <Input id="agency-name" required maxLength={120} autoFocus value={name} onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} /></div>
    <div className="space-y-2 text-left"><Label htmlFor="agency-slug">Alamat workspace</Label>
      <Input id="agency-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={48} value={slug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }} />
      <p className="text-xs text-muted-foreground">socialagent.app/{slug || "nama-agensi"}</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={pending || !name.trim() || !slug}>{pending ? "Membuat…" : "Lanjut"}</Button>
  </form>;
}

function DirectorStep({ name, onChange, onNext }: { name: string; onChange: (v: string) => void; onNext: () => void }) {
  return <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="w-full space-y-5">
    <Heading title="Buat agent pertama kamu">Agency Director memimpin tim AI: mengatur prioritas antar brand dan mendelegasikan ke spesialis.</Heading>
    <div className="space-y-2 text-left"><Label htmlFor="director-name">Nama agent</Label>
      <Input id="director-name" required maxLength={80} autoFocus value={name} placeholder="mis. Agency Director" onChange={(e) => onChange(e.target.value)} /></div>
    <Button type="submit" className="w-full" disabled={!name.trim()}>Lanjut</Button>
  </form>;
}

function InstallStep({ slug, director, onDone, onBack }: { slug: string; director: string; onDone: () => void; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    let cancelled = false;
    void installAgencyTeam(slug, director).then((result) => {
      if (cancelled) return;
      if (result.ok) done.current(); else setError(result.error);
    });
    return () => { cancelled = true; };
  }, [slug, director, attempt]);
  return <div className="w-full space-y-5">
    <Heading title="Menyiapkan agensi kamu">{director} sedang merekrut {AGENCY_CORE_TEAM.length - 1} spesialis. Model AI sudah disediakan SocialAgent, tidak perlu API key.</Heading>
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p>
      <div className="flex justify-center gap-2"><Button variant="outline" onClick={onBack}>Kembali</Button><Button onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Coba lagi</Button></div></div>
      : <p role="status" className="text-sm text-muted-foreground">Menyiapkan tim…</p>}
  </div>;
}

function ReadyStep({ slug, director }: { slug: string; director: string }) {
  const router = useRouter();
  return <div className="w-full space-y-5">
    <Heading title={`${director} siap bekerja!`}>Langkah berikutnya: tambahkan klien dan brand pertama, lalu buat ide konten untuk tim AI.</Heading>
    <div className="flex flex-col gap-2">
      <Button className="w-full" onClick={() => router.push(`/${slug}/brands`)}>Tambah klien &amp; brand</Button>
      <Button variant="outline" className="w-full" onClick={() => router.push(`/${slug}/dashboard`)}>Ke dashboard</Button>
    </div>
  </div>;
}

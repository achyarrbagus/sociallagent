"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type Studio = { id: string; name: string; slug: string };

const PALETTE = ["var(--sa-coral)", "var(--sa-blue)", "var(--sa-yellow)", "var(--sa-teal)"];

export function StudioMark({ studio, className }: { studio: Studio; className?: string }) {
  const initials = studio.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const color = PALETTE[[...studio.id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
  return <span aria-hidden="true" style={{ background: color }}
    className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-xs font-semibold text-[var(--sa-ink)]", className)}>{initials}</span>;
}

/** Studio (agency) switcher at the top of the sidebar, like socialagent's company menu. */
export function StudioSwitcher({ current, studios, rail = false }: { current: Studio; studios: Studio[]; rail?: boolean }) {
  const router = useRouter();
  async function open(studio: Studio) {
    await authClient.organization.setActive({ organizationId: studio.id });
    router.push(`/${studio.slug}/dashboard`);
  }
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={`Studio: ${current.name}. Ganti studio`}
      className={cn("flex w-full items-center gap-2 rounded-xl border border-transparent p-1.5 text-left hover:border-border hover:bg-card", rail && "justify-center")}>
      <StudioMark studio={current} />
      {!rail && <><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{current.name}</span><span className="block truncate text-xs text-muted-foreground">Studio</span></span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuLabel>Ganti studio</DropdownMenuLabel>
      {studios.map((s) => <DropdownMenuItem key={s.id} onSelect={() => { if (s.id !== current.id) void open(s); }} className="gap-2">
        <StudioMark studio={s} className="size-6 text-[10px]" /><span className="min-w-0 flex-1 truncate">{s.name}</span>
        {s.id === current.id && <Check className="size-4" aria-label="Studio aktif" />}
      </DropdownMenuItem>)}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => router.push("/onboarding")} className="gap-2"><Plus className="size-4" aria-hidden="true" />Studio baru</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

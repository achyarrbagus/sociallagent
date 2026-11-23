"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import {
  BarChart3, Bot, Building2, CalendarDays, ChevronDown, FolderKanban, History, LayoutDashboard, MessagesSquare, Share2, SquarePen,
} from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { characterStateForAgent } from "@/lib/agent-appearance";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ComponentType<{ className?: string }> };
export type SidebarAgent = { id: string; name: string; paletteId: string; status: string; isDirector: boolean; isLead: boolean };

const SECTIONS: { id: string; label: string; items: Item[] }[] = [
  {
    id: "workspace", label: "Workspace", items: [
      { href: "dashboard", label: "Hari ini", icon: LayoutDashboard },
      { href: "brands", label: "Klien & Brand", icon: Building2 },
      { href: "campaigns", label: "Campaign", icon: FolderKanban },
      { href: "content", label: "Konten & Review", icon: SquarePen },
      { href: "calendar", label: "Kalender", icon: CalendarDays },
    ],
  },
  {
    id: "agent", label: "Agent", items: [
      { href: "chat", label: "Chat", icon: MessagesSquare },
      { href: "team", label: "Tim AI", icon: Bot },
    ],
  },
  {
    id: "operations", label: "Operations", items: [
      { href: "social", label: "Akun Sosial", icon: Share2 },
      { href: "reports", label: "Laporan", icon: BarChart3 },
      { href: "activity", label: "Aktivitas", icon: History },
    ],
  },
];

const itemClass = "flex items-center gap-3 rounded-full border border-transparent px-3 py-2 text-sm font-medium";
const STORAGE_KEY = "socialagent:sidebar-collapsed";

// Collapsed sections live in localStorage (per-viewer convenience); the server renders all open.
const listeners = new Set<() => void>();
const collapsedStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  read(): string { try { return localStorage.getItem(STORAGE_KEY) ?? "{}"; } catch { return "{}"; } },
  toggle(id: string) {
    const next = { ...parse(collapsedStore.read()), [id]: !parse(collapsedStore.read())[id] };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    for (const listener of listeners) listener();
  },
};
function parse(raw: string): Record<string, boolean> {
  try { return JSON.parse(raw) as Record<string, boolean>; } catch { return {}; }
}

export function SidebarNav({ slug, agents = [], compact = false }: { slug: string; agents?: SidebarAgent[]; compact?: boolean }) {
  const pathname = usePathname();
  const collapsed = parse(useSyncExternalStore(collapsedStore.subscribe, collapsedStore.read, () => "{}"));
  const toggle = collapsedStore.toggle;
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const link = ({ href, label, icon: Icon }: Item) => {
    const path = `/${slug}/${href}`;
    // An agent row owns its chat URL; keep "Chat" highlighted only on the index.
    const active = href === "chat" ? isActive(path) && !agents.some((a) => pathname === `${path}/${a.id}` && !a.isDirector) : isActive(path);
    return <Link key={href} href={path} aria-current={active ? "page" : undefined} className={cn(itemClass, "shrink-0", !active && "hover:bg-accent")}>
      <Icon className="size-4" aria-hidden="true" />{label}
    </Link>;
  };

  if (compact) {
    return <nav aria-label="Navigasi agensi" className="flex gap-1 overflow-x-auto px-3 pb-3">
      {SECTIONS.flatMap((s) => s.items).map(link)}
    </nav>;
  }

  return <nav aria-label="Navigasi agensi" className="flex flex-col gap-4 px-3">
    {SECTIONS.map((section) => <Section key={section.id} id={section.id} label={section.label} open={!collapsed[section.id]} onToggle={() => toggle(section.id)}>
      {section.items.map(link)}
      {section.id === "agent" && agents.length > 0 && <ul className="mt-1 space-y-0.5" aria-label="Agent">
        {/* Director and the three heads; specialists stay one click away on the team page. */}
        {agents.filter((a) => a.isDirector || a.isLead || pathname === `/${slug}/chat/${a.id}` || a.status === "running").map((agent) => {
          const path = `/${slug}/chat/${agent.id}`;
          const active = pathname === path;
          return <li key={agent.id}><Link href={path} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-full border border-transparent py-1 pl-4 pr-3 text-sm", !active && "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <AgentAvatar paletteId={agent.paletteId} name={agent.name} size={20} pose={characterStateForAgent(agent.status)} muted={agent.status === "paused"} />
            <span className="min-w-0 flex-1 truncate">{agent.name}</span>
            {agent.status === "running" && <span className="size-2 shrink-0 rounded-full bg-[var(--sa-teal)]" aria-label="sedang bekerja" />}
          </Link></li>;
        })}
        <li><Link href={`/${slug}/team`} className="block py-1 pl-4 text-xs text-muted-foreground underline-offset-4 hover:underline">Semua agent ({agents.length})</Link></li>
      </ul>}
    </Section>)}
  </nav>;
}

function Section({ id, label, open, onToggle, children }: { id: string; label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section aria-labelledby={`sidebar-${id}`} className="flex flex-col gap-1">
    <button type="button" id={`sidebar-${id}`} onClick={onToggle} aria-expanded={open}
      className="flex items-center justify-between rounded-md px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
      {label}<ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
    </button>
    {open && children}
  </section>;
}

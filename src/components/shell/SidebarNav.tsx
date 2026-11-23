"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { parsePrefs, sidebarStore } from "./sidebarStore";
import {
  BarChart3, Bot, Building2, CalendarDays, ChevronDown, FolderKanban, History, Inbox, LayoutDashboard, MessagesSquare, Share2, SquarePen,
} from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { characterStateForAgent } from "@/lib/agent-appearance";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ComponentType<{ className?: string }> };
export type SidebarAgent = { id: string; name: string; paletteId: string; status: string; isDirector: boolean; isLead: boolean };

const SECTIONS: { id: string; label: string; items: Item[] }[] = [
  {
    id: "workspace", label: "Workspace", items: [
      { href: "inbox", label: "Inbox", icon: Inbox },
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

export function SidebarNav({ slug, agents = [], compact = false, rail = false, inboxCount = 0 }: {
  slug: string; agents?: SidebarAgent[]; compact?: boolean; rail?: boolean; inboxCount?: number;
}) {
  const pathname = usePathname();
  const collapsed = parsePrefs(useSyncExternalStore(sidebarStore.subscribe, sidebarStore.snapshot, sidebarStore.serverSnapshot)).collapsed ?? {};
  const toggle = (id: string) => sidebarStore.update((prefs) => ({ ...prefs, collapsed: { ...prefs.collapsed, [id]: !prefs.collapsed?.[id] } }));
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const link = ({ href, label, icon: Icon }: Item) => {
    const path = `/${slug}/${href}`;
    // An agent row owns its chat URL; keep "Chat" highlighted only on the index.
    const active = href === "chat" ? isActive(path) && !agents.some((a) => pathname === `${path}/${a.id}` && !a.isDirector) : isActive(path);
    const badge = href === "inbox" && inboxCount > 0 ? inboxCount : 0;
    return <Link key={href} href={path} aria-current={active ? "page" : undefined} title={rail ? label : undefined}
      aria-label={rail ? `${label}${badge ? ` (${badge})` : ""}` : undefined}
      className={cn(itemClass, "relative shrink-0", rail && "justify-center px-0", !active && "hover:bg-accent")}>
      <Icon className="size-4" aria-hidden="true" />{!rail && <span className="flex-1">{label}</span>}
      {badge > 0 && <span aria-hidden={rail} className={cn("rounded-full border border-border bg-[var(--sa-coral)] px-1.5 text-[11px] font-semibold leading-5 text-[var(--sa-ink)]", rail && "absolute -right-1 -top-1 px-1 leading-4")}>
        {badge > 99 ? "99+" : badge}{!rail && <span className="sr-only"> perlu perhatian</span>}</span>}
    </Link>;
  };

  if (compact) {
    return <nav aria-label="Navigasi agensi" className="flex gap-1 overflow-x-auto px-3 pb-3">
      {SECTIONS.flatMap((s) => s.items).map(link)}
    </nav>;
  }

  return <nav aria-label="Navigasi agensi" className="flex flex-col gap-4 px-3">
    {SECTIONS.map((section) => <Section key={section.id} id={section.id} label={section.label} rail={rail} open={rail || !collapsed[section.id]} onToggle={() => toggle(section.id)}>
      {section.items.map(link)}
      {section.id === "agent" && agents.length > 0 && <ul className="mt-1 space-y-0.5" aria-label="Agent">
        {/* Director and the three heads; specialists stay one click away on the team page. */}
        {agents.filter((a) => a.isDirector || a.isLead || pathname === `/${slug}/chat/${a.id}` || a.status === "running").map((agent) => {
          const path = `/${slug}/chat/${agent.id}`;
          const active = pathname === path;
          return <li key={agent.id}><Link href={path} aria-current={active ? "page" : undefined} title={rail ? agent.name : undefined} aria-label={rail ? `Chat dengan ${agent.name}` : undefined}
            className={cn("flex items-center gap-2 rounded-full border border-transparent py-1 pl-4 pr-3 text-sm", rail && "justify-center px-0", !active && "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <AgentAvatar paletteId={agent.paletteId} name={agent.name} size={20} pose={characterStateForAgent(agent.status)} muted={agent.status === "paused"} />
            {!rail && <span className="min-w-0 flex-1 truncate">{agent.name}</span>}
            {agent.status === "running" && <span className="size-2 shrink-0 rounded-full bg-[var(--sa-teal)]" aria-label="sedang bekerja" />}
          </Link></li>;
        })}
        {!rail && <li><Link href={`/${slug}/team`} className="block py-1 pl-4 text-xs text-muted-foreground underline-offset-4 hover:underline">Semua agent ({agents.length})</Link></li>}
      </ul>}
    </Section>)}
  </nav>;
}

function Section({ id, label, open, rail, onToggle, children }: { id: string; label: string; open: boolean; rail: boolean; onToggle: () => void; children: ReactNode }) {
  if (rail) return <section aria-label={label} className="flex flex-col gap-1 border-t border-border/50 pt-2 first:border-t-0 first:pt-0">{children}</section>;
  return <section aria-labelledby={`sidebar-${id}`} className="flex flex-col gap-1">
    <button type="button" id={`sidebar-${id}`} onClick={onToggle} aria-expanded={open}
      className="flex items-center justify-between rounded-md px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
      {label}<ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
    </button>
    {open && children}
  </section>;
}

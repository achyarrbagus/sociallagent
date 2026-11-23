"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BarChart3, Building2, CalendarDays, FileText, FolderKanban, History, Inbox, LayoutDashboard, MessagesSquare, Plus, Share2, Bot } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { searchAgency, type SearchResults } from "@/lib/search/actions";

const PAGES = [
  { href: "inbox", label: "Inbox", icon: Inbox },
  { href: "dashboard", label: "Hari ini", icon: LayoutDashboard },
  { href: "content", label: "Konten & Review", icon: FileText },
  { href: "calendar", label: "Kalender", icon: CalendarDays },
  { href: "chat", label: "Chat", icon: MessagesSquare },
  { href: "team", label: "Tim AI", icon: Bot },
  { href: "brands", label: "Klien & Brand", icon: Building2 },
  { href: "campaigns", label: "Campaign", icon: FolderKanban },
  { href: "social", label: "Akun Sosial", icon: Share2 },
  { href: "reports", label: "Laporan", icon: BarChart3 },
  { href: "activity", label: "Aktivitas", icon: History },
];

const EMPTY: SearchResults = { brands: [], campaigns: [], contents: [], agents: [] };

/** ⌘K / Ctrl+K: jump to pages, brands, campaigns, content and agents. */
export function SearchPalette({ slug, open, onOpenChange, onBrief }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void; onBrief: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [, startSearch] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => startSearch(async () => setResults(await searchAgency(slug, query))), 150);
    return () => clearTimeout(timer);
  }, [open, query, slug]);

  const go = (path: string) => { onOpenChange(false); setQuery(""); router.push(`/${slug}/${path}`); };
  const q = query.trim().toLowerCase();
  const pages = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q));

  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Cari" description="Cari halaman, brand, campaign, konten, atau agent" shouldFilter={false}>
    <CommandInput placeholder="Cari brand, konten, agent…" value={query} onValueChange={setQuery} />
    <CommandList>
      <CommandEmpty>Tidak ada hasil.</CommandEmpty>
      {!q && <CommandGroup heading="Aksi"><CommandItem onSelect={() => { onOpenChange(false); onBrief(); }}><Plus />Buat brief</CommandItem></CommandGroup>}
      {results.contents.length > 0 && <CommandGroup heading="Konten">{results.contents.map((c) => <CommandItem key={c.id} value={`content-${c.id}`} onSelect={() => go(`content/${c.id}`)}><FileText />{c.title}<CommandShortcut>{c.brand}</CommandShortcut></CommandItem>)}</CommandGroup>}
      {results.brands.length > 0 && <CommandGroup heading="Brand">{results.brands.map((b) => <CommandItem key={b.id} value={`brand-${b.id}`} onSelect={() => go(`content?brandId=${b.id}`)}><Building2 />{b.name}<CommandShortcut>{b.client}</CommandShortcut></CommandItem>)}</CommandGroup>}
      {results.campaigns.length > 0 && <CommandGroup heading="Campaign">{results.campaigns.map((c) => <CommandItem key={c.id} value={`campaign-${c.id}`} onSelect={() => go(`campaigns/${c.id}`)}><FolderKanban />{c.name}<CommandShortcut>{c.brand}</CommandShortcut></CommandItem>)}</CommandGroup>}
      {results.agents.length > 0 && <CommandGroup heading="Agent">{results.agents.map((a) => <CommandItem key={a.id} value={`agent-${a.id}`} onSelect={() => go(`chat/${a.id}`)}><AgentAvatar paletteId={a.paletteId} name={a.name} size={20} />{a.name}<CommandShortcut>{a.title}</CommandShortcut></CommandItem>)}</CommandGroup>}
      {pages.length > 0 && <CommandGroup heading="Halaman">{pages.map((p) => <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}><p.icon />{p.label}</CommandItem>)}</CommandGroup>}
    </CommandList>
  </CommandDialog>;
}

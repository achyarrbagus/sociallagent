"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useState, useSyncExternalStore, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BriefDialog, type BriefOptions } from "./BriefDialog";
import { SearchPalette } from "./SearchPalette";
import { SidebarNav, type SidebarAgent } from "./SidebarNav";
import { parsePrefs, sidebarStore } from "./sidebarStore";
import { StudioSwitcher, type Studio } from "./StudioSwitcher";
import { UserMenu } from "./UserMenu";

export type ShellProps = {
  studio: Studio; studios: Studio[]; user: { name: string; email: string };
  agents: SidebarAgent[]; inboxCount: number; brief: BriefOptions;
};

type Dialogs = { openBrief: () => void; openSearch: () => void };
const ShellDialogs = createContext<Dialogs>({ openBrief: () => {}, openSearch: () => {} });

/** Owns the one brief dialog and one ⌘K palette shared by the desktop sidebar and mobile header. */
export function ShellProvider({ studio, brief, children }: Pick<ShellProps, "studio" | "brief"> & { children: ReactNode }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The layout persists across navigation, so close dialogs when the route changes
  // (e.g. after a saved brief redirects to its content page).
  const pathname = usePathname();
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setBriefOpen(false);
    setSearchOpen(false);
  }
  return <ShellDialogs value={{ openBrief: () => setBriefOpen(true), openSearch: () => setSearchOpen(true) }}>
    {children}
    <BriefDialog key={String(briefOpen)} slug={studio.slug} open={briefOpen} onOpenChange={setBriefOpen} options={brief} />
    <SearchPalette slug={studio.slug} open={searchOpen} onOpenChange={setSearchOpen} onBrief={() => setBriefOpen(true)} />
  </ShellDialogs>;
}

const useShellDialogs = () => use(ShellDialogs);

/** Desktop sidebar: studio switcher, quick actions, sectioned nav, user menu. Collapses to an icon rail. */
export function AppSidebar({ studio, studios, user, agents, inboxCount }: ShellProps) {
  const rail = parsePrefs(useSyncExternalStore(sidebarStore.subscribe, sidebarStore.snapshot, sidebarStore.serverSnapshot)).rail ?? false;
  const dialogs = useShellDialogs();
  const toggleRail = () => sidebarStore.update((prefs) => ({ ...prefs, rail: !prefs.rail }));

  return <aside className={cn("sidebar-shell-panel hidden shrink-0 flex-col gap-3 py-3 transition-[width] md:flex", rail ? "w-[72px]" : "w-64")}>
    <div className={cn("flex items-center gap-1 px-3", rail && "flex-col")}>
      <div className="min-w-0 flex-1"><StudioSwitcher current={studio} studios={studios} rail={rail} /></div>
      <Button variant="ghost" size="sm" onClick={toggleRail} aria-label={rail ? "Lebarkan sidebar" : "Ciutkan sidebar"} title={rail ? "Lebarkan sidebar" : "Ciutkan sidebar"}>
        {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </Button>
    </div>
    <div className={cn("flex gap-2 px-3", rail && "flex-col items-center")}>
      <Button onClick={() => dialogs.openBrief()} className={cn(!rail && "flex-1")} aria-label="Buat brief" title="Buat brief">
        <Plus className="size-4" aria-hidden="true" />{!rail && "Buat brief"}
      </Button>
      <Button variant="outline" onClick={() => dialogs.openSearch()} aria-label="Cari (⌘K)" title="Cari (⌘K)"><Search className="size-4" aria-hidden="true" /></Button>
    </div>
    <div className="flex-1 overflow-y-auto">
      <SidebarNav slug={studio.slug} agents={agents} rail={rail} inboxCount={inboxCount} />
    </div>
    <div className="px-3"><UserMenu user={user} rail={rail} /></div>
  </aside>;
}

/** Mobile header: same switcher and actions, nav as a scrolling row. */
export function MobileHeader({ studio, studios, user, inboxCount }: ShellProps) {
  const dialogs = useShellDialogs();
  return <header className="sidebar-shell-panel border-b md:hidden">
    <div className="flex items-center gap-2 p-3">
      <div className="min-w-0 flex-1"><StudioSwitcher current={studio} studios={studios} /></div>
      <Button size="sm" onClick={() => dialogs.openBrief()} aria-label="Buat brief"><Plus className="size-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => dialogs.openSearch()} aria-label="Cari"><Search className="size-4" /></Button>
      <div className="w-10"><UserMenu user={user} rail /></div>
    </div>
    <SidebarNav slug={studio.slug} compact inboxCount={inboxCount} />
  </header>;
}

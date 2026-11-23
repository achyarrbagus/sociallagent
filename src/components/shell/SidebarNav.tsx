"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, FileText, FolderKanban, LayoutDashboard, LineChart, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "dashboard", label: "Hari ini", icon: LayoutDashboard },
  { href: "brands", label: "Klien & Brand", icon: Building2 },
  { href: "campaigns", label: "Campaign", icon: FolderKanban },
  { href: "content", label: "Konten", icon: FileText },
  { href: "calendar", label: "Kalender", icon: CalendarDays },
  { href: "team", label: "Tim AI", icon: Bot },
] as const;

// Later phases. Shown so the agency sees where the product is heading.
const SOON = [
  { label: "Laporan", icon: LineChart },
] as const;

const itemClass = "flex items-center gap-3 rounded-full border border-transparent px-3 py-2 text-sm font-medium";

export function SidebarNav({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi agensi" className={compact ? "flex gap-1 overflow-x-auto px-3 pb-3" : "flex flex-col gap-1 px-3"}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const path = `/${slug}/${href}`;
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link key={href} href={path} aria-current={active ? "page" : undefined} className={cn(itemClass, "shrink-0", !active && "hover:bg-accent")}>
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      {!compact && <>
      <p className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Segera hadir</p>
      {SOON.map(({ label, icon: Icon }) => (
        <span key={label} aria-disabled="true" className={cn(itemClass, "text-muted-foreground")}>
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </span>
      ))}
      </>}
    </nav>
  );
}

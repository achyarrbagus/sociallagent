"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function UserMenu({ user, rail = false }: { user: { name: string; email: string }; rail?: boolean }) {
  const router = useRouter();
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={`Akun ${user.name}`} className={cn("flex w-full items-center gap-2 rounded-xl border border-border bg-card p-2 text-left text-sm", rail && "justify-center p-1.5")}>
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--sa-accent-soft)] text-xs font-semibold text-[var(--sa-ink)]">{initials}</span>
      {!rail && <span className="min-w-0 flex-1"><span className="block truncate font-medium">{user.name}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="w-56">
      <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void signOut()} className="gap-2"><LogOut className="size-4" aria-hidden="true" />Keluar</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

type AgencyOption = { id: string; name: string; slug: string };

export function AccountMenu({ user, agency, agencies }: {
  user: { name: string; email: string };
  agency: AgencyOption;
  agencies: AgencyOption[];
}) {
  const router = useRouter();
  async function switchTo(target: AgencyOption) {
    await authClient.organization.setActive({ organizationId: target.id });
    router.push(`/${target.slug}/dashboard`);
  }
  async function signOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{agency.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Agensi</DropdownMenuLabel>
        {agencies.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => void switchTo(a)} disabled={a.id === agency.id}>
            {a.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
          <Plus className="size-4" aria-hidden="true" /> Agensi baru
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" aria-hidden="true" /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

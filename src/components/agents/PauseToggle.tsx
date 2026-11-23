"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAgentPaused } from "@/lib/agents/actions";

export function PauseToggle({ slug, agentId, paused, disabled }: { slug: string; agentId: string; paused: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={() => start(() => setAgentPaused(slug, agentId, !paused))}>
    {paused ? "Aktifkan" : "Jeda"}
  </Button>;
}

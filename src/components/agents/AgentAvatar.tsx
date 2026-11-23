"use client";

import { useState } from "react";
import { appearanceForPalette, AGENT_PALETTE_IDS, type AgentAvatarSize, type AgentPaletteId, type CharacterState } from "@/lib/agent-appearance";
import { cn } from "@/lib/utils";

export const avatarSizeClasses: Record<AgentAvatarSize, string> = {
  16: "size-4", 20: "size-5", 24: "size-6", 32: "size-8", 40: "size-10", 48: "size-12",
  64: "size-16", 96: "size-24", 128: "size-32", 256: "size-64", 512: "size-128",
};

export function paletteOf(paletteId: string): AgentPaletteId {
  return (AGENT_PALETTE_IDS as readonly string[]).includes(paletteId) ? paletteId as AgentPaletteId : AGENT_PALETTE_IDS[0];
}

export function agentAvatarUrl(paletteId: string, size: AgentAvatarSize, pose: CharacterState = "rest", muted = false) {
  const appearance = appearanceForPalette(paletteOf(paletteId));
  return `/api/agent-avatars/${muted ? "muted-dream" : appearance.paletteId}/${pose}.svg?size=${size}`;
}

export interface AgentAvatarProps {
  paletteId: string;
  name: string;
  size?: AgentAvatarSize;
  label?: string;
  pose?: CharacterState;
  muted?: boolean;
  className?: string;
}

export function AgentAvatar({ paletteId, name, size = 24, label, pose = "rest", muted = false, className }: AgentAvatarProps) {
  const src = agentAvatarUrl(paletteId, size, pose, muted);
  const [failed, setFailed] = useState<string | null>(null);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span data-slot="agent-avatar" className={cn("relative inline-flex shrink-0 items-center justify-center align-middle", avatarSizeClasses[size], className)}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {failed === src ? <span className="text-xs text-muted-foreground">{initials}</span> :
        // eslint-disable-next-line @next/next/no-img-element -- generated SVG, no optimization needed
        <img src={src} alt="" width={size} height={size} decoding="async" loading="lazy" className="size-full object-contain" onError={() => setFailed(src)} />}
    </span>
  );
}

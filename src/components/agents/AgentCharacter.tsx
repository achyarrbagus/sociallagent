"use client";

// Live ClipLab character, ported from socialagent's AgentCharacter.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { appearanceForPalette, type AgentAvatarSize, type CharacterState } from "@/lib/agent-appearance";
import type { createCharacter } from "@/lib/cliplab/runtime";
import { cn } from "@/lib/utils";
import { AgentAvatar, avatarSizeClasses, paletteOf } from "./AgentAvatar";
import { characterSlot } from "./characterSlot";

type Player = ReturnType<typeof createCharacter>;

export interface AgentCharacterProps {
  paletteId: string;
  name: string;
  size?: AgentAvatarSize;
  state?: CharacterState;
  muted?: boolean;
  label?: string;
  className?: string;
  trackingRegion?: RefObject<HTMLElement | null>;
  trackingScope?: "region" | "page";
  followCursor?: boolean;
}

export function AgentCharacter({ paletteId, name, size = 256, state = "idle", muted = false, label, className, trackingRegion, trackingScope = "region", followCursor = true }: AgentCharacterProps) {
  const identity = useMemo(() => appearanceForPalette(paletteOf(paletteId)), [paletteId]);
  const root = useRef<HTMLSpanElement>(null), host = useRef<HTMLSpanElement>(null), player = useRef<Player | null>(null);
  const slotId = useRef(Symbol("agent-character"));
  const owner = useSyncExternalStore(characterSlot.subscribe, characterSlot.getSnapshot, () => null);
  const [visible, setVisible] = useState(false), [reduced, setReduced] = useState(true), [failed, setFailed] = useState(false), [ready, setReady] = useState(false);
  const active = visible && !reduced && !failed && state !== "rest";

  useEffect(() => {
    if (typeof matchMedia !== "function" || typeof IntersectionObserver !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches); change(); media.addEventListener("change", change);
    const observer = new IntersectionObserver((entries) => setVisible(entries[0]?.isIntersecting ?? false));
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); media.removeEventListener("change", change); };
  }, []);
  useEffect(() => {
    if (active && owner === null) characterSlot.acquire(slotId.current);
    if (!active) characterSlot.release(slotId.current);
  }, [active, owner]);
  useEffect(() => { const id = slotId.current; return () => characterSlot.release(id); }, []);
  useEffect(() => {
    if (!active || owner !== slotId.current) return;
    let disposed = false;
    void Promise.all([import("@/lib/cliplab/runtime"), import("@/lib/cliplab/definition")]).then(([runtime, library]) => {
      if (disposed || !host.current) return;
      player.current = runtime.createCharacter(host.current, library.characterDefinition(identity, muted), {
        animation: library.animationId(state), trackingRegion: trackingRegion?.current ?? root.current ?? undefined,
        followCursor, followRotation: true, trackingScope, displaySize: size, onError: () => setFailed(true),
      });
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; player.current?.destroy(); player.current = null; setReady(false); };
    // Re-creating the player on state/identity changes is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, owner, trackingRegion, trackingScope, size, followCursor]);
  useEffect(() => {
    if (!player.current) return;
    void import("@/lib/cliplab/definition").then((library) => {
      player.current?.setDefinition(library.characterDefinition(identity, muted));
      player.current?.setAnimation(library.animationId(state));
    });
  }, [identity, muted, state, ready]);

  return <span ref={root} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    className={cn("relative inline-block shrink-0", avatarSizeClasses[size], className)}>
    <AgentAvatar paletteId={paletteId} name={name} size={size < 256 ? 256 : size} pose={state} muted={muted} className={cn("size-full", ready && "invisible")} />
    <span ref={host} className="absolute inset-0" />
  </span>;
}

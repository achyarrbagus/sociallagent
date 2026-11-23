// Ported from socialagent server/src/services/social-publishing (Copyright (c) 2025 Paperclip AI, MIT).
import type { SocialAdapter } from "./types";
import { facebookPageAdapter } from "./facebook";
import { xAdapter } from "./x";
import { linkedinAdapter } from "./linkedin";
import { tiktokAdapter } from "./tiktok";
import { instagramAdapter } from "./instagram";

const adapters = new Map<string, SocialAdapter>([
  [facebookPageAdapter.platform, facebookPageAdapter],
  [xAdapter.platform, xAdapter],
  [linkedinAdapter.platform, linkedinAdapter],
  [tiktokAdapter.platform, tiktokAdapter],
  [instagramAdapter.platform, instagramAdapter],
]);

export function registerSocialAdapter(adapter: SocialAdapter): void {
  adapters.set(adapter.platform, adapter);
}

export function socialAdapter(platform: string): SocialAdapter | null {
  return adapters.get(platform) ?? null;
}

export function connectedPlatforms(): SocialAdapter["platform"][] {
  return [...adapters.keys()] as SocialAdapter["platform"][];
}

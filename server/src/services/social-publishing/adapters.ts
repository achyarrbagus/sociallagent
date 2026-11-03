import type { SocialAdapter } from "./types.js";
import { facebookPageAdapter } from "./facebook.js";
import { xAdapter } from "./x.js";
import { linkedinAdapter } from "./linkedin.js";
import { tiktokAdapter } from "./tiktok.js";

const adapters = new Map<string, SocialAdapter>([
  [facebookPageAdapter.platform, facebookPageAdapter],
  [xAdapter.platform, xAdapter],
  [linkedinAdapter.platform, linkedinAdapter],
  [tiktokAdapter.platform, tiktokAdapter],
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

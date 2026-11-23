import { AGENT_AVATAR_SIZES, AGENT_PALETTE_IDS, CHARACTER_STATES, appearanceForPalette, type AgentAvatarSize, type AgentPaletteId, type CharacterState } from "@/lib/agent-appearance";
import { renderAgentSvg } from "@/lib/cliplab/static";

/** Static ClipLab still. Same geometry as the live character; immutable per (palette, pose, size). */
export async function GET(request: Request, { params }: RouteContext<"/api/agent-avatars/[palette]/[pose]">) {
  const { palette, pose } = await params;
  const state = pose.replace(/\.svg$/, "");
  const size = Number(new URL(request.url).searchParams.get("size") ?? 256);
  const muted = palette === "muted-dream";
  if ((!muted && !(AGENT_PALETTE_IDS as readonly string[]).includes(palette))
    || !(CHARACTER_STATES as readonly string[]).includes(state)
    || !(AGENT_AVATAR_SIZES as readonly number[]).includes(size)) {
    return new Response("Not found", { status: 404 });
  }
  const appearance = appearanceForPalette(muted ? AGENT_PALETTE_IDS[0] : palette as AgentPaletteId);
  const svg = renderAgentSvg(appearance, size as AgentAvatarSize, 1, state as CharacterState, muted);
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

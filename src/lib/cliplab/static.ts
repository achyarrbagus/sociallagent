import type { AgentAppearance, AgentAvatarSize, CharacterState } from "@/lib/agent-appearance";
import { characterDefinition, characterStill } from "./definition";
import { CharacterRenderer } from "./renderer";
import { snapshotSvg } from "./svg-snapshot";

/** Same geometry/face projection as the live character, without DOM or WebGL. */
export function renderAgentSvg(appearance: AgentAppearance, size: AgentAvatarSize, scale: 1 | 2, state: CharacterState = "rest", muted = false): string {
  const definition = characterDefinition(appearance, muted);
  const renderer = new CharacterRenderer(null, { width: size * scale, height: size * scale, displaySize: size });
  try {
    renderer.render({ ...definition.character, trueFront: true, lockPosition: true, followCursor: false, followRotation: false },
      characterStill(definition, state), { rotation: { x: 0, y: 0, z: 0 } });
    return snapshotSvg(renderer.snapshotScene(), "agent-");
  } finally { renderer.dispose(); }
}

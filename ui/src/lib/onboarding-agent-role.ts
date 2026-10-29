import { AGENT_ROLE_LABELS, type AgentRole } from "@paperclipai/shared";

/**
 * The role every onboarding hire is filed under.
 *
 * The first agent is the Agency Director: it leads the agency and the agency
 * team is installed under it right after the hire, which the server only does
 * for an agent filed as `ceo`. The wizard therefore asks for a name and never
 * a role. `ceo` is an internal enum value; the owner only ever sees
 * "Agency Director".
 */
export const DEFAULT_AGENT_ROLE = "ceo" as const;

/**
 * The name the wizard offers for the first agent. It is a job title rather
 * than a role label because it reads as a person on the very first screen
 * where the agent appears.
 */
export const DEFAULT_AGENT_NAME = "Agency Director";

/**
 * Names the wizard put there itself, and may therefore replace. Anything the
 * customer typed is theirs and survives a role change.
 *
 * The prototype's version of this step simply overwrote the name whenever the
 * role changed, which is fine in a mock with no real input to lose. Here it
 * would silently discard a name someone chose deliberately, and the loss is
 * invisible: the field still has *a* plausible name in it afterwards.
 */
const WIZARD_SUPPLIED_NAMES: ReadonlySet<string> = new Set([
  DEFAULT_AGENT_NAME,
  // The previous default. A run restored from a draft saved by an earlier
  // build may still hold it, and it was never the customer's choice.
  "Chief of staff",
  ...Object.values(AGENT_ROLE_LABELS),
]);

/**
 * The name to show after a role change — the new role's label when the field
 * still holds something the wizard supplied, otherwise the customer's own text.
 */
export function nextAgentNameForRole(params: {
  currentName: string;
  nextRole: AgentRole;
}): string {
  const current = params.currentName.trim();
  if (current === "" || WIZARD_SUPPLIED_NAMES.has(current)) {
    return AGENT_ROLE_LABELS[params.nextRole];
  }
  return params.currentName;
}

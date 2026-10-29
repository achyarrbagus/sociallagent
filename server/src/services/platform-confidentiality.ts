import { eq } from "drizzle-orm";
import { instanceSettings, type Db } from "@paperclipai/db";
import { managedAiModelPolicySchema } from "@paperclipai/shared";

/** What company users see in place of the operator's AI infrastructure. */
export const PLATFORM_AI_NAME = "SocialAgent AI";

/**
 * 9Router model ids carry a routing prefix, e.g. `cx/gpt-6.1-sol` or
 * `ocz/claude-sonnet-5[1m]`. A digit or hyphen is required so ordinary text
 * such as "cx/ux" is left alone.
 */
const GATEWAY_MODEL_ID = /\b(?:cx|ocz|oc|mmf)\/(?=[A-Za-z0-9._-]*[\d-])[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]\s]*\])?/g;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces the operator's gateway, model ids and endpoint in text with
 * "SocialAgent AI". `terms` are extra exact strings to hide (configured model
 * ids, connection names). Longest terms are replaced first.
 */
export function redactPlatformDetails(text: string, terms: Iterable<string> = []) {
  let result = text.replace(GATEWAY_MODEL_ID, PLATFORM_AI_NAME);
  const ordered = [...new Set([...terms].map((term) => term.trim()).filter((term) => term.length >= 3))]
    .sort((a, b) => b.length - a.length);
  for (const term of ordered) result = result.replace(new RegExp(escapeRegExp(term), "gi"), PLATFORM_AI_NAME);
  return result.replace(new RegExp(`${escapeRegExp(PLATFORM_AI_NAME)}(?:\\s*\\(${escapeRegExp(PLATFORM_AI_NAME)}\\))+`, "g"), PLATFORM_AI_NAME);
}

let cached: { at: number; terms: string[] } | null = null;

/** Exact strings that identify the managed gateway on this instance (cached for a minute). */
export async function confidentialPlatformTerms(db: Pick<Db, "select">): Promise<string[] | null> {
  // Read the environment directly: this runs on the comment path and must not
  // pull in the managed-gateway service graph.
  if (!process.env.SOCIALAGENT_9ROUTER_API_KEY?.trim()) return null;
  if (cached && Date.now() - cached.at < 60_000) return cached.terms;
  const baseUrl = process.env.SOCIALAGENT_9ROUTER_BASE_URL?.trim() || "https://9router.amifish.com/v1";
  const terms = new Set<string>(["9Router", "9 Router", baseUrl]);
  try { terms.add(new URL(baseUrl).host); } catch { /* invalid URL is rejected elsewhere */ }
  for (const key of ["SOCIALAGENT_9ROUTER_CLAUDE_MODEL", "SOCIALAGENT_9ROUTER_CODEX_MODEL"]) {
    const model = process.env[key]?.trim();
    if (model) terms.add(model);
  }
  const [row] = await db.select({ aiModels: instanceSettings.aiModels }).from(instanceSettings)
    .where(eq(instanceSettings.singletonKey, "default"));
  const parsed = managedAiModelPolicySchema.safeParse(row?.aiModels ?? {});
  if (parsed.success) {
    for (const adapter of [parsed.data.claude_local, parsed.data.codex_local]) {
      if (adapter.defaultModel) terms.add(adapter.defaultModel);
      for (const model of Object.values(adapter.roles)) if (model) terms.add(model);
    }
  }
  cached = { at: Date.now(), terms: [...terms] };
  return cached.terms;
}

/** In SaaS mode, agent-written text never names the operator's gateway or models. */
export async function redactAgentText(db: Pick<Db, "select">, text: string) {
  const terms = await confidentialPlatformTerms(db);
  return terms ? redactPlatformDetails(text, terms) : text;
}

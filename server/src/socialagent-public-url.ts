/**
 * The single reader for SOCIALAGENT_PUBLIC_URL: the server origin sandboxes
 * reach for the managed AI gateway proxy. Side-effect free so config.ts and
 * services can both use it.
 *
 * The URL must be https, except on a loopback host (localhost, 127.0.0.1,
 * ::1) for local development. An invalid value is treated as unset by
 * callers (managed runs refuse), and `error` explains why for startup logs.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export type SocialagentPublicUrl = { url: string | null; error: string | null };

export function parseSocialagentPublicUrl(raw: string | undefined | null): SocialagentPublicUrl {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return { url: null, error: null };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: "SOCIALAGENT_PUBLIC_URL is not a valid URL" };
  }
  if (parsed.protocol === "https:") return { url: value, error: null };
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { url: value, error: null };
  }
  return {
    url: null,
    error: "SOCIALAGENT_PUBLIC_URL must use https (plain http is allowed only for localhost, 127.0.0.1 or ::1)",
  };
}

/** The validated public URL without a trailing slash, or null when unset or invalid. */
export function readSocialagentPublicUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return parseSocialagentPublicUrl(env.SOCIALAGENT_PUBLIC_URL).url;
}

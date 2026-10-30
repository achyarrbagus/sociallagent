const REMOTE_EXECUTION_ENV_IDENTITY_KEYS = new Set([
  "PATH",
  "HOME",
  "PWD",
  "SHELL",
  "USER",
  "LOGNAME",
  "NVM_DIR",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
]);

function readEnvValueCaseInsensitive(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const direct = env[key];
  if (typeof direct === "string") return direct;
  const upper = key.toUpperCase();
  for (const [candidateKey, candidateValue] of Object.entries(env)) {
    if (candidateKey.toUpperCase() === upper && typeof candidateValue === "string") {
      return candidateValue;
    }
  }
  return undefined;
}

export function sanitizeRemoteExecutionEnv(
  env: Record<string, string>,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const normalizedKey = key.toUpperCase();
    if (!REMOTE_EXECUTION_ENV_IDENTITY_KEYS.has(normalizedKey)) {
      sanitized[key] = value;
      continue;
    }
    const inheritedValue = readEnvValueCaseInsensitive(inheritedEnv, key);
    if (typeof inheritedValue === "string" && inheritedValue === value) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

const REMOTE_PROBE_ENV_HOST_KEYS = new Set(["PATH", "HOME"]);

/**
 * Builds the env sent to a remote (sandbox) target for install/probe commands
 * from an ALLOWLIST: the agent's explicitly configured env plus PATH/HOME.
 * Host-inherited variables (server secrets, host provider keys) never leave
 * the host. When `explicitEnv` is omitted, any entry whose value equals the
 * host's own value for that key is treated as host-inherited and dropped.
 */
export function buildRemoteProbeEnv(
  env: NodeJS.ProcessEnv | Record<string, string>,
  explicitEnv?: NodeJS.ProcessEnv | Record<string, string> | null,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const allowed: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    if (REMOTE_PROBE_ENV_HOST_KEYS.has(key.toUpperCase())) {
      allowed[key] = value;
      continue;
    }
    if (explicitEnv) continue;
    if (inheritedEnv[key] === value) continue;
    allowed[key] = value;
  }
  if (explicitEnv) {
    for (const [key, value] of Object.entries(explicitEnv)) {
      if (typeof value === "string") allowed[key] = value;
    }
  }
  return sanitizeRemoteExecutionEnv(allowed, inheritedEnv);
}

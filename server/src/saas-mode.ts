/**
 * Side-effect-free SaaS / managed-sandbox policy switches. Keep this module
 * free of imports: `config.ts` loads env files on import, and call sites that
 * only need the policy must not trigger that.
 */

/**
 * Multi-tenant SaaS switch (SOCIALAGENT_SAAS_MODE=true). Read from the
 * environment at call time so code without the config object can consult it.
 */
export function isSaasMode(): boolean {
  return process.env.SOCIALAGENT_SAAS_MODE === "true";
}

/**
 * True when agent code must never execute on the server host: SaaS mode, or
 * the instance-level `enableManagedSandboxOnly` experimental flag.
 */
export function isManagedSandboxOnly(
  experimental: { enableManagedSandboxOnly?: boolean } | null | undefined,
): boolean {
  return isSaasMode() || experimental?.enableManagedSandboxOnly === true;
}

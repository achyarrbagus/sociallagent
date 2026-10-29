import { eq } from "drizzle-orm";
import { instanceSettings, type Db } from "@paperclipai/db";
import { APP_STORE_DEFINITIONS, type AppDefinition, type ConnectorPolicyApp } from "@paperclipai/shared";

const SETTINGS_KEY = "default";

/** Custom MCP/REST servers added by URL have no catalog slug; the admin allows them as one item. */
export const CUSTOM_CONNECTOR_SLUG = "custom";

/** AI providers are governed by the AI model lock, not the connector allowlist. */
function isAiOnly(app: AppDefinition) {
  return Boolean(app.aiConnectionRouter) || (app.methods.length > 0 && app.methods.every((method) => method.purpose === "ai"));
}

export function connectorPolicyCatalog(): ConnectorPolicyApp[] {
  return [
    ...APP_STORE_DEFINITIONS.filter((app) => !isAiOnly(app)).map((app) => ({
      slug: app.slug,
      name: app.name,
      description: app.description,
      logoUrl: app.branding.logoUrl,
      ...(app.branding.darkLogoUrl ? { darkLogoUrl: app.branding.darkLogoUrl } : {}),
    })),
    { slug: CUSTOM_CONNECTOR_SLUG, name: "Custom server", description: "MCP or REST servers added by URL.", logoUrl: "" },
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** Catalog slug for a chat provider, so a chat channel is allowed through its app. */
export function connectorSlugForChatProvider(provider: string) {
  return APP_STORE_DEFINITIONS.find((app) => app.methods.some((method) => method.provider === provider))?.slug ?? provider;
}

/**
 * Instance-wide allowlist of Apps catalog connectors for SaaS mode. It starts
 * empty: company users can connect nothing until an instance admin allows it.
 */
export function connectorPolicyService(db: Db) {
  async function getAllowed(): Promise<Set<string>> {
    const [row] = await db
      .select({ allowed: instanceSettings.allowedConnectors })
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, SETTINGS_KEY));
    return new Set(Array.isArray(row?.allowed) ? row.allowed.filter((slug): slug is string => typeof slug === "string") : []);
  }

  async function setAllowed(slugs: string[]) {
    const known = new Set(connectorPolicyCatalog().map((app) => app.slug));
    const allowed = [...new Set(slugs)].filter((slug) => known.has(slug)).sort();
    const now = new Date();
    await db
      .insert(instanceSettings)
      .values({ singletonKey: SETTINGS_KEY, general: {}, experimental: {}, allowedConnectors: allowed, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [instanceSettings.singletonKey], set: { allowedConnectors: allowed, updatedAt: now } });
    return allowed;
  }

  return { getAllowed, setAllowed };
}

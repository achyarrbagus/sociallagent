import { TabFilters } from "@/components/TabBar";

export const CATALOG_SOURCES = ["paperclip", "composio", "arcade", "installed", "all"] as const;
export type CatalogSource = typeof CATALOG_SOURCES[number];
export const CATALOG_SOURCE_NAMES = { paperclip: "SocialAgent", composio: "Composio", arcade: "Arcade", executor: "Executor", installed: "Installed", all: "All" };
// SocialAgent hides the aggregator catalogs for now; their filters still work when selected programmatically.
export const HIDDEN_CATALOG_SOURCES: ReadonlySet<CatalogSource> = new Set(["composio", "arcade"]);
export const VISIBLE_CATALOG_SOURCES = CATALOG_SOURCES.filter(value => !HIDDEN_CATALOG_SOURCES.has(value));

export function CatalogSourceFilters({ source, onChange }: { source: CatalogSource; onChange: (source: CatalogSource) => void }) {
  return <TabFilters label="App filters" size="standard" items={VISIBLE_CATALOG_SOURCES.map(value => ({ value, label: CATALOG_SOURCE_NAMES[value] }))} value={source} onValueChange={onChange} />;
}

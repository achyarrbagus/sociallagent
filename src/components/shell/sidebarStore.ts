// Per-viewer sidebar preferences (rail mode, collapsed sections). localStorage only;
// the server always renders the expanded sidebar with every section open.
type Prefs = { rail?: boolean; collapsed?: Record<string, boolean> };

const KEY = "socialagent:sidebar";
const listeners = new Set<() => void>();

export const sidebarStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot(): string { try { return localStorage.getItem(KEY) ?? "{}"; } catch { return "{}"; } },
  serverSnapshot: () => "{}",
  update(change: (prefs: Prefs) => Prefs) {
    const next = change(parsePrefs(sidebarStore.snapshot()));
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: preference just won't stick */ }
    for (const listener of listeners) listener();
  },
};

export function parsePrefs(raw: string): Prefs {
  try { return JSON.parse(raw) as Prefs; } catch { return {}; }
}

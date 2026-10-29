// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DecisionHistoryTable } from "./DecisionHistory";
import { modelDisplayName } from "@/lib/model-display";
import type { DecisionHistoryEntry } from "@paperclipai/shared";

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompany: { issuePrefix: "ACM" } }),
}));

describe("model history setup links", () => {
  it("renders distinct model aliases in request history without exposing model IDs", () => {
    const entry: DecisionHistoryEntry = {
      id: "request-1", feature: "settings.test", actorType: "system", responsibleUserId: null, userName: null,
      issueId: null, issueIdentifier: null, agentId: null, runId: null,
      connectionId: "connection-1", provider: "openai", model: "gpt-6-sol", status: "succeeded", errorCode: null,
      startedAt: "2026-10-25T00:00:00.000Z", finishedAt: null, durationMs: 1000,
      inputTokens: 1, outputTokens: 1, costCents: "1", costStatus: "reported",
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      flushSync(() => root.render(<MemoryRouter><DecisionHistoryTable entries={[entry, { ...entry, id: "request-2", model: "gpt-6-astra" }]} /></MemoryRouter>));
      expect(container.textContent).toContain(modelDisplayName("gpt-6-sol"));
      expect(container.textContent).toContain(modelDisplayName("gpt-6-astra"));
      expect(container.textContent).not.toContain("gpt-6-");
      expect(entry.model).toBe("gpt-6-sol");
    } finally {
      flushSync(() => root.unmount());
    }
  });
  it.each([
    [false, true, "/ACM/company/settings/connections", "Configure a decision model"],
    [false, false, "/ACM/company/settings/connections", "Configure a decision model"],
    [true, true, "/ACM/company/settings/connections", "Configure fast response"],
    [true, false, "/ACM/company/settings/instance/experimental", "Enable experimental fast responses"],
  ] as const)("routes setup with fast response %s and experiment %s", (fastResponse, fastResponsesEnabled, href, label) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      flushSync(() => root.render(
        <MemoryRouter>
          <DecisionHistoryTable entries={[]} fastResponse={fastResponse} fastResponsesEnabled={fastResponsesEnabled} />
        </MemoryRouter>,
      ));
      expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
      expect(container.querySelector("a")?.textContent).toBe(label);
    } finally {
      flushSync(() => root.unmount());
    }
  });
});

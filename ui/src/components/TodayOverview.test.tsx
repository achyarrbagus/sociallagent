// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TodayOverview } from "./TodayOverview";
import { queryKeys } from "../lib/queryKeys";
import { todayRange } from "../lib/today-overview";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
  useActiveCompanyPrefix: () => "TES",
}));
vi.mock("../context/DialogContext", () => ({ useDialogActions: () => ({ openNewIssue: vi.fn() }) }));
vi.mock("../api/issues", () => ({ issuesApi: {
  list: vi.fn(async () => [{ id: "recent", projectId: "campaign", status: "done" }]),
  listAll: vi.fn(async () => [{ id: "recent", projectId: "campaign", status: "done" }, { id: "older", projectId: "campaign", status: "todo" }]),
} }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TodayOverview", () => {
  it("renders complete campaign progress and company-prefixed agency links", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["agency-content", "company", "today-review"], { items: [], nextCursor: null });
    client.setQueryData(["agency-publications", "company", "today", todayRange(new Date())], []);
    client.setQueryData(queryKeys.projects.list("company"), [{ id: "campaign", name: "Launch", brandId: "brand", status: "in_progress", archivedAt: null }]);
    client.setQueryData(queryKeys.agency("company"), { brands: [{ id: "brand", name: "Brand" }] });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<QueryClientProvider client={client}><TodayOverview companyId="company" companyName="Agency" agents={[]} agentsError={null} notices={null} /></QueryClientProvider>);
      });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const progress = host.querySelector("progress");
      expect(progress?.getAttribute("max")).toBe("2");
      expect(progress?.getAttribute("value")).toBe("1");
      expect(host.textContent).toContain("50%");
      expect(host.querySelector('a[href="/TES/content"]')).not.toBeNull();
      expect(host.querySelector('a[href="/TES/calendar"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      client.clear();
    }
  });
});

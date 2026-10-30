// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { CreditBalance } from "./CreditBalance";
vi.mock("@/api/credits", () => ({ creditsApi: { balance: async () => ({ enabled: true, allowanceMicrounits: "1000000000", spentMicrounits: "7000000", remainingMicrounits: "993000000", periodEnd: "2026-11-01T00:00:00.000Z", history: [] }) } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("shows an organization's remaining and used credits", async () => {
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); const client = new QueryClient();
  await act(async () => { root.render(<QueryClientProvider client={client}><CreditBalance companyId="company" /></QueryClientProvider>); await new Promise(resolve => setTimeout(resolve, 0)); });
  await vi.waitFor(() => expect(container.textContent).toContain("993"));
  expect(container.textContent).toContain("7 used");
  await act(async () => root.unmount()); client.clear(); container.remove();
});

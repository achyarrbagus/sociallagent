// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { CreditSettings } from "./CreditSettings";

vi.mock("@/api/credits", () => ({ creditsApi: { settings: async () => ({ allowance: 1000, input: 1, cachedInput: 0.1, output: 5 }), updateSettings: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("shows the admin's monthly allowance and token rates", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><CreditSettings /></QueryClientProvider>); await new Promise(resolve => setTimeout(resolve, 0)); });
  await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('[aria-label="Monthly credits"]')?.value).toBe("1000"));
  expect(container.textContent).toContain("Credits per 1,000 tokens");
  expect(container.textContent).toContain("rounded up to the nearest 0.000001 credit");
  await act(async () => root.unmount()); client.clear(); container.remove();
});

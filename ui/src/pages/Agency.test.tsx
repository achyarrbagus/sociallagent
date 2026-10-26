// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Agency } from "./Agency";

const state = vi.hoisted(() => ({ companyId: "company-a", canManage: true }));
const api = vi.hoisted(() => ({ directory: vi.fn(), createClient: vi.fn(), updateClient: vi.fn(), createBrand: vi.fn(), updateBrand: vi.fn() }));
vi.mock("../api/agency", () => ({ agencyApi: api }));
vi.mock("../api/projects", () => ({ projectsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() } }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: state.companyId }) }));
const breadcrumbs = vi.hoisted(() => ({ setBreadcrumbs: vi.fn() }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => breadcrumbs }));
vi.mock("../lib/router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

let root: Root;
let container: HTMLDivElement;
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === text);
  expect(button, text).toBeTruthy();
  act(() => button!.click());
}
async function render() {
  state.companyId = "company-a";
  api.directory.mockImplementation(() => Promise.resolve({ clients: [], brands: [], canManage: state.canManage }));
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = () => <QueryClientProvider client={client}><Agency /></QueryClientProvider>;
  act(() => root.render(view())); await flush(); await flush();
  return () => { act(() => root.render(view())); };
}
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); vi.clearAllMocks(); state.canManage = true; });

describe("Agency directory", () => {
  it("submits client data in the selected company and surfaces server failures", async () => {
    api.createClient.mockRejectedValue(new Error("Owner access revoked"));
    await render(); click("New client");
    const input = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Client A"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    expect(api.createClient).toHaveBeenCalledWith("company-a", expect.objectContaining({ name: "Client A" }));
    expect(container.textContent).toContain("Owner access revoked");
  });
  it("closes drafts when the company changes", async () => {
    const rerender = await render(); click("New client");
    expect(container.querySelector("form")).not.toBeNull();
    state.companyId = "company-b"; rerender(); await flush(); await flush();
    expect(container.querySelector("form")).toBeNull();
    expect(api.createClient).not.toHaveBeenCalled();
  });
  it("keeps mutation controls hidden for read-only actors", async () => {
    state.canManage = false; await render();
    expect(container.textContent).toContain("Clients & Brands");
    expect(container.textContent).not.toContain("New client");
    expect(container.textContent).not.toContain("New brand");
  });
});

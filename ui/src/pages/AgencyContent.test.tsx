// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyContent } from "./AgencyContent";

const brandId = "321019ac-e685-4e11-aa6b-21bf62dc1c60";
const projectId = "d6a97e66-e061-425f-8c1d-c3e388cad38b";
const state = vi.hoisted(() => ({ companyId: "company-a" }));
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
const breadcrumb = vi.hoisted(() => ({ setBreadcrumbs: vi.fn() }));
vi.mock("../api/agency-content", () => ({ agencyContentApi: api }));
vi.mock("../api/agency", () => ({ agencyApi: { directory: vi.fn().mockResolvedValue({ clients: [{ id: "client", archivedAt: null }], brands: [{ id: "321019ac-e685-4e11-aa6b-21bf62dc1c60", clientId: "client", name: "Coffee", archivedAt: null }], canManage: true }) } }));
vi.mock("../api/projects", () => ({ projectsApi: { list: vi.fn().mockResolvedValue([{ id: "d6a97e66-e061-425f-8c1d-c3e388cad38b", brandId: "321019ac-e685-4e11-aa6b-21bf62dc1c60", name: "Campaign" }]) } }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: state.companyId }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => breadcrumb }));
vi.mock("../lib/router", () => ({ useParams: () => ({}), useLocation: () => ({ search: "?brandId=321019ac-e685-4e11-aa6b-21bf62dc1c60" }), useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("../components/agency/ContentTasks", () => ({ ContentTasks: () => null }));

let root: Root; let host: HTMLDivElement;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }
async function render() {
  state.companyId = "company-a"; api.list.mockResolvedValue({ items: [], nextCursor: null });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = () => <QueryClientProvider client={queryClient}><AgencyContent /></QueryClientProvider>;
  act(() => root.render(view())); await flush(); await flush();
  return () => act(() => root.render(view()));
}
function newIdea() { act(() => Array.from(host.querySelectorAll("button")).find(b => b.textContent === "New idea")!.click()); }
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); vi.clearAllMocks(); });
describe("agency content directory", () => {
  it("resets the content draft when company identity changes", async () => {
    const rerender = await render(); newIdea(); expect(host.querySelector("form")).not.toBeNull();
    state.companyId = "company-b"; rerender(); await flush(); await flush();
    expect(host.querySelector("form")).toBeNull(); expect(api.create).not.toHaveBeenCalled();
  });
  it("submits the selected brand/campaign and surfaces a server rejection without losing the form", async () => {
    api.create.mockRejectedValue(new Error("Campaign changed")); await render(); newIdea();
    host.querySelector<HTMLInputElement>('input[name="title"]')!.value = "Farmer story";
    host.querySelector<HTMLTextAreaElement>('textarea[name="idea"]')!.value = "Meet the farmer";
    host.querySelector<HTMLSelectElement>('select[name="projectId"]')!.value = projectId;
    act(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush();
    expect(api.create).toHaveBeenCalledWith("company-a", expect.objectContaining({ brandId, projectId, title: "Farmer story" }));
    expect(host.textContent).toContain("Campaign changed"); expect(host.querySelector("form")).not.toBeNull();
  });
});

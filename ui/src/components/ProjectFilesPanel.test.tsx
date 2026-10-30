// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFilesPanel } from "./ProjectFilesPanel";
import { queryKeys } from "../lib/queryKeys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../api/project-files", () => ({
  projectFilesApi: {
    list: vi.fn().mockResolvedValue({ files: [], totalBytes: 0, limits: { maxFiles: 500, maxTotalBytes: 104857600 } }),
    upload: vi.fn(),
    remove: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function render(saasMode: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.health, saasMode ? { status: "ok", saasMode: true } : { status: "ok" });
  flushSync(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ProjectFilesPanel companyId="company-1" projectId="project-1" />
      </QueryClientProvider>,
    );
  });
}

describe("ProjectFilesPanel", () => {
  it("offers folder upload outside SaaS mode", () => {
    render(false);
    expect(container.querySelector("input[webkitdirectory]")).not.toBeNull();
    expect(container.textContent).toContain("Upload folder");
  });

  it("renders no folder picker in SaaS mode", () => {
    render(true);
    expect(container.querySelector("input[webkitdirectory]")).toBeNull();
    expect(container.querySelector("input[directory]")).toBeNull();
    expect(container.textContent).not.toContain("Upload folder");
    expect(container.textContent).toContain("Add files");
    expect(container.querySelectorAll("input[type=file]")).toHaveLength(1);
  });
});

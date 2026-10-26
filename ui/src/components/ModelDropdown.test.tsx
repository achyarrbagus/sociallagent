// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModelDropdown } from "./AgentConfigForm";
import { modelDisplayCode, modelDisplayName } from "@/lib/model-display";

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

function renderOpenDropdown(
  models: AdapterModel[],
  { groupByProvider = false, preserveOrder = false, ...props }: Partial<ComponentProps<typeof ModelDropdown>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <TooltipProvider>
        <ModelDropdown
          models={models}
          value=""
          onChange={() => {}}
          open
          onOpenChange={() => {}}
          allowDefault={false}
          required
          groupByProvider={groupByProvider}
          preserveOrder={preserveOrder}
          {...props}
        />
      </TooltipProvider>,
    );
  });
}

function shownModelIds(): string[] {
  return Array.from(document.body.querySelectorAll("span[title]")).map((span) => span.getAttribute("title") ?? "");
}

const curated = [
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
];

describe("ModelDropdown", () => {
  it("distinguishes multiple Bruno versions and submits the chosen ID", () => {
    const onChange = vi.fn();
    const ids = ["gpt-6-sol", "gpt-6.1-sol"];
    renderOpenDropdown(ids.map(id => ({ id, label: id })), { onChange });
    const options = [...document.querySelectorAll<HTMLButtonElement>('button[role="option"]')];
    expect(options).toHaveLength(2);
    for (const id of ids) {
      const option = options.find(node => node.textContent?.includes(modelDisplayCode(id)))!;
      expect(option.textContent).toContain("Bruno");
      expect(option.textContent).not.toContain(id);
      act(() => option.click());
      expect(onChange).toHaveBeenLastCalledWith(id);
    }
  });

  it("does not treat a searched display alias as a new provider model ID", () => {
    renderOpenDropdown([{ id: "gpt-6-sol", label: "GPT Sol" }], { creatable: true });
    const search = document.querySelector<HTMLInputElement>('input[placeholder="Search models... (type to create)"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Bruno");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Bruno");
    expect(document.body.textContent).not.toContain("Use manual model");
  });

  it("masks current and detected models missing from the catalog", () => {
    renderOpenDropdown([], { value: "gpt-6-sol", detectedModel: "gpt-6-luna", detectedModelCandidates: ["vendor/private-alpha"] });
    expect(document.body.textContent).toContain("Bruno");
    expect(document.body.textContent).toContain("Yuna");
    expect(document.body.textContent).not.toMatch(/gpt-6|private-alpha/);
    expect([...document.querySelectorAll('[title]')].map(node => node.getAttribute("title")).join(" ")).not.toMatch(/gpt-6|private-alpha/);
  });

  it.each(["searchable", "native"] as const)("masks model labels and tooltips while selecting the original ID (%s)", presentation => {
    const onChange = vi.fn();
    const models = [{ id: "gpt-6.1-sol", label: "GPT Sol" }, { id: "gpt-6-luna", label: "GPT Luna" }];
    renderOpenDropdown(models, { presentation, value: models[0].id, onChange });
    expect(document.body.textContent).toContain("Bruno");
    expect(document.body.textContent).toContain("Yuna");
    expect(document.body.textContent).not.toMatch(/GPT Sol|GPT Luna|gpt-6/);
    expect([...document.querySelectorAll('[title]')].map(node => node.getAttribute("title")).join(" ")).not.toMatch(/gpt-6/);
    if (presentation === "native") {
      const select = document.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!;
      act(() => { select.value = models[1].id; select.dispatchEvent(new Event("change", { bubbles: true })); });
    } else {
      const option = [...document.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(node => node.textContent?.includes("Yuna"))!;
      act(() => option.click());
    }
    expect(onChange).toHaveBeenCalledWith("gpt-6-luna");
  });

  it("keeps a hand-ordered list in the adapter's order when preserveOrder is set", () => {
    renderOpenDropdown(curated, { preserveOrder: true });

    expect(shownModelIds()).toEqual(curated.map((model) => modelDisplayName(model.id)));
  });

  it("still sorts a discovered list by id by default", () => {
    renderOpenDropdown(curated);

    expect(shownModelIds()).toEqual(["claude-fable-5-1", "claude-haiku-4-5", "claude-opus-4-8", "claude-opus-5-5"].map(modelDisplayName));
  });

  it("still sorts provider groups by id", () => {
    renderOpenDropdown(
      [
        { id: "openai/gpt-6-sol", label: "gpt-6-sol" },
        { id: "openai/gpt-6-astra", label: "gpt-6-astra" },
      ],
      { groupByProvider: true },
    );

    expect(shownModelIds()).toEqual(["openai/gpt-6-astra", "openai/gpt-6-sol"].map(modelDisplayName));
  });
});

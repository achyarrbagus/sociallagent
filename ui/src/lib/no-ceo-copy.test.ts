import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const UI_SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function isExcluded(file: string): boolean {
  const base = path.basename(file);
  return /\.test\./.test(base) || /\.stories\./.test(base) || /fixtures/.test(base);
}

/** Blank out comments (keeping newlines) while leaving string literals intact. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

describe("owner-visible copy", () => {
  it("never says CEO in UI source strings or JSX text", () => {
    const offenders: string[] = [];
    for (const file of walk(UI_SRC)) {
      if (isExcluded(file)) continue;
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, idx) => {
        if (/\bCEO\b/.test(line)) {
          offenders.push(`${path.relative(UI_SRC, file)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

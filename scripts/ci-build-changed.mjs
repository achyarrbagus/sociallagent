import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC_ONLY_PATHS = new Set(["README.md", "AGENTS.md", "CONTRIBUTING.md", "LICENSE"]);
const DOC_ONLY_PREFIXES = ["doc/", "docs/", "maps/"];

export function selectBuildTargets(changedFiles) {
  if (changedFiles.length === 0) return { targets: [], reason: "no changed files" };
  if (changedFiles.every((file) => DOC_ONLY_PATHS.has(file) || DOC_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix)))) {
    return { targets: [], reason: "documentation-only change" };
  }

  const areas = new Set();
  for (const file of changedFiles) {
    if (file.startsWith("ui/")) areas.add("ui");
    else if (file.startsWith("server/")) areas.add("server");
    else if (file.startsWith("packages/paperclip-runner/")) areas.add("runner");
    else return { targets: ["build"], reason: `full build fallback for ${file}` };
  }

  const targets = [];
  if (areas.has("runner")) targets.push("build:runner");
  if (areas.has("server") || areas.has("runner")) targets.push("build:server");
  if (areas.has("ui")) targets.push("build:ui");
  return {
    targets,
    reason: `${[...areas].join(" + ")} workspace change`,
  };
}

function changedFilesFromGit() {
  const event = process.env.CI_BUILD_EVENT ?? "";
  const base = process.env.CI_BUILD_BASE_SHA?.trim();
  if (event === "workflow_dispatch" || !base || /^0+$/.test(base)) return null;
  try {
    const range = event === "pull_request" ? `${base}...HEAD` : `${base} HEAD`;
    const args = ["diff", "--name-only", "--diff-filter=ACDMRT", ...range.split(" ")];
    const output = execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    return output.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"));
  } catch {
    return null;
  }
}

function parseArguments(argv) {
  const result = { files: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (argv[index] === "--files") {
      result.files = argv.slice(index + 1).map((file) => file.replaceAll("\\", "/"));
      break;
    }
    throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return result;
}

function runTarget(target) {
  const result = spawnSync("bun", ["run", target], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const changedFiles = args.files ?? changedFilesFromGit();
  const plan = changedFiles === null
    ? { targets: ["build"], reason: "full build fallback because the base commit is unavailable" }
    : selectBuildTargets(changedFiles);

  console.log(`[ci-build] ${plan.reason}`);
  if (plan.targets.length === 0) {
    console.log("[ci-build] no package build required");
    return;
  }
  console.log(`[ci-build] targets: ${plan.targets.join(", ")}`);
  if (args.dryRun) return;
  for (const target of plan.targets) {
    const status = runTarget(target);
    if (status !== 0) process.exitCode = status;
    if (status !== 0) return;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ci-build] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

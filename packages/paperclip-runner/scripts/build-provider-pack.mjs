import profiles from "../acpx-profiles.json" with { type: "json" };
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseProviderPackArguments, materializeCandidateProviderPack, providerPackProviders, providerPackManifestFields } from "./candidate-provider-pack.mjs";
import { buildNodeStartupTimeout } from "./build-node-startup-timeout.mjs";
import { writePortableExecutableShim, writePortableCopilotShims } from "./provider-pack-executable-shims.mjs";
import { providerPackLibc, removeControllerArtifactsFromProviderPack, removeForeignLibcPackagesFromProviderPack } from "./provider-pack-runtime-tree.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const { output: outputArgument, candidates } = parseProviderPackArguments(process.argv.slice(2));
const outputRoot = resolve(
  process.cwd(),
  outputArgument ?? join(packageRoot, "provider-pack"),
);
if (
  outputRoot === workspaceRoot ||
  outputRoot === packageRoot ||
  outputRoot === "/"
) {
  throw new Error(`Refusing unsafe provider-pack output path: ${outputRoot}`);
}

const temporaryParent = realpathSync(mkdtempSync(join(tmpdir(), "paperclip-provider-pack-")));
const temporaryRoot = join(temporaryParent, "pack");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256File(path) {
  return `sha256:${createHash("sha256")
    .update(readFileSync(path))
    .digest("hex")}`;
}

function sha256Tree(root) {
  const hash = createHash("sha256");
  const visit = (directory, prefix = "") => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relativePath}\n`);
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0${sha256File(absolutePath)}\n`);
      } else if (entry.isSymbolicLink()) {
        hash.update(
          `symlink\0${relativePath}\0${readlinkSync(absolutePath)}\n`,
        );
      } else {
        throw new Error(
          `Provider pack tree contains unsupported entry ${relativePath}`,
        );
      }
    }
  };
  visit(root);
  return `sha256:${hash.digest("hex")}`;
}

function writePortableNodeShim(name, entrypoint) {
  const shimPath = join(temporaryRoot, "node_modules", ".bin", name);
  // Bun links .bin entries to the package's own script; writing through that
  // link would overwrite the package file instead of replacing the command.
  rmSync(shimPath, { force: true });
  writeFileSync(
    shimPath,
    [
      "#!/bin/sh",
      "set -eu",
      'basedir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
      `exec "$basedir/../node/bin/node" "$basedir/../${entrypoint}" "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(shimPath, 0o755);
}

function runInstallStep(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? result.signal}`);
  }
}

// Dependency lifecycle scripts the pack needs. pnpm 9 ran every dependency
// script during `pnpm deploy`; Bun blocks them unless trusted. OpenCode's
// postinstall copies its native binary over the bin/opencode.exe placeholder,
// and esbuild's verifies its platform binary.
const PACK_TRUSTED_DEPENDENCIES = ["esbuild", "opencode-ai"];

/** Workspace packages the manifest names with a workspace: specifier, in any dependency section. */
function workspaceDependencyNames(manifest) {
  const names = new Set();
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (typeof specifier === "string" && specifier.startsWith("workspace:")) names.add(name);
    }
  }
  return names;
}

/**
 * Bun has no `pnpm deploy`. Reproduce it: unpack the Runner as it would be
 * published (`bun pm pack` honours its `files` list) into a minimal copy of the
 * workspace, install its production dependencies from the workspace bun.lock
 * with the isolated linker, then move the package store into the package so
 * the pack is self-contained and relocatable.
 */
function deployRunnerPackage(target) {
  const stage = join(temporaryParent, "workspace");
  const tarballs = join(temporaryParent, "tarball");
  const runnerRelative = relative(workspaceRoot, packageRoot);
  const stagedRunner = join(stage, runnerRelative);
  mkdirSync(stagedRunner, { recursive: true });
  mkdirSync(tarballs);

  runInstallStep("bun", ["pm", "pack", "--ignore-scripts", "--quiet", "--destination", tarballs], packageRoot);
  const tarball = readdirSync(tarballs).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("bun pm pack produced no tarball");
  runInstallStep("tar", ["-xzf", join(tarballs, tarball), "-C", stagedRunner, "--strip-components=1"], stage);

  // A frozen install compares the staged manifests with bun.lock, so stage the
  // source manifests (bun pm pack rewrites workspace: specifiers) together with
  // every workspace the Runner names, even dev-only ones that production mode
  // never installs. Absent unrelated workspaces are skipped by Bun.
  copyFileSync(join(packageRoot, "package.json"), join(stagedRunner, "package.json"));
  for (const file of ["package.json", "bun.lock"]) copyFileSync(join(workspaceRoot, file), join(stage, file));
  cpSync(join(workspaceRoot, "patches"), join(stage, "patches"), { recursive: true });
  const pending = [...workspaceDependencyNames(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")))];
  const staged = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (staged.has(name)) continue;
    staged.add(name);
    // Workspace packages may not export ./package.json, so follow the
    // installed workspace link instead of resolving through `exports`.
    const linked = [packageRoot, workspaceRoot]
      .map((directory) => join(directory, "node_modules", name, "package.json"))
      .find((path) => existsSync(path));
    if (!linked) throw new Error(`Workspace dependency ${name} is not installed`);
    const manifestPath = realpathSync(linked);
    const workspaceRelative = relative(workspaceRoot, dirname(manifestPath));
    if (workspaceRelative.startsWith("..")) throw new Error(`Workspace dependency ${name} resolves outside the workspace`);
    mkdirSync(join(stage, workspaceRelative), { recursive: true });
    copyFileSync(manifestPath, join(stage, workspaceRelative, "package.json"));
    pending.push(...workspaceDependencyNames(JSON.parse(readFileSync(manifestPath, "utf8"))));
  }

  runInstallStep("bun", [
    "install",
    "--production",
    "--frozen-lockfile",
    // `pnpm deploy` never ran the Runner's own postinstall; Bun would, and it
    // materializes Copilot assets the build writes itself further down.
    "--ignore-scripts",
    "--omit=peer",
    "--linker=isolated",
    "--filter",
    JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).name,
  ], stage);
  runInstallStep("bun", ["pm", "trust", ...PACK_TRUSTED_DEPENDENCIES], stage);

  // Move the store under the package and repoint the package's own links.
  // Links inside the store are relative to the store and move with it.
  const stageStore = join(stage, "node_modules", ".bun");
  const packStore = join(stagedRunner, "node_modules", ".bun");
  const relink = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (path === packStore) continue;
      if (entry.isSymbolicLink()) {
        const resolved = resolve(directory, readlinkSync(path));
        if (resolved.startsWith(`${stageStore}${sep}`)) {
          unlinkSync(path);
          symlinkSync(relative(directory, join(packStore, relative(stageStore, resolved))), path);
        }
      } else if (entry.isDirectory()) {
        relink(path);
      }
    }
  };
  relink(join(stagedRunner, "node_modules"));
  renameSync(stageStore, packStore);
  renameSync(stagedRunner, target);
}

/** Every link in the pack must resolve to a path inside the pack. */
function assertPackIsSelfContained(root) {
  const realRoot = realpathSync(root);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let target;
        try {
          target = realpathSync(path);
        } catch {
          throw new Error(`Provider pack link ${relative(root, path)} is dangling`);
        }
        if (target !== realRoot && !target.startsWith(`${realRoot}${sep}`)) {
          throw new Error(`Provider pack link ${relative(root, path)} points outside the pack`);
        }
      } else if (entry.isDirectory()) {
        visit(path);
      }
    }
  };
  visit(root);
}

try {
  deployRunnerPackage(temporaryRoot);
  removeControllerArtifactsFromProviderPack(temporaryRoot);
  const foreignLibcPackages = removeForeignLibcPackagesFromProviderPack(temporaryRoot, providerPackLibc());
  if (foreignLibcPackages.length) {
    process.stderr.write(`Removed ${foreignLibcPackages.length} provider-pack packages built for another libc: ${foreignLibcPackages.join(", ")}\n`);
  }

  // Fail the image build if a bridge silently brings back an older/private
  // provider CLI. A direct dependency alone does not deduplicate the graph.
  const packRequire = createRequire(join(temporaryRoot, "package.json"));
  const codexAcpRequire = createRequire(packRequire.resolve("@agentclientprotocol/codex-acp/package.json"));
  if (realpathSync(codexAcpRequire.resolve("@openai/codex/package.json")) !==
      realpathSync(packRequire.resolve("@openai/codex/package.json"))) {
    throw new Error("Codex ACP must share the image's Codex installation");
  }

  // Reuse the already-qualified build interpreter instead of introducing a
  // package-manager lifecycle hook or a second binary supply chain. The pack
  // manifest binds the copied bytes, platform, architecture, and minimum
  // version before any provider is launched.
  const minimumNodeVersion = [24, 11, 0];
  const actualNodeVersion = process.versions.node.split(".").map(Number);
  if (
    actualNodeVersion[0] < minimumNodeVersion[0] ||
    (actualNodeVersion[0] === minimumNodeVersion[0] &&
      (actualNodeVersion[1] < minimumNodeVersion[1] ||
        (actualNodeVersion[1] === minimumNodeVersion[1] &&
          actualNodeVersion[2] < minimumNodeVersion[2])))
  ) {
    throw new Error("Provider pack build Node is older than 24.11.0");
  }
  const stableNodeRoot = join(temporaryRoot, "node_modules", "node");
  if (existsSync(stableNodeRoot)) {
    throw new Error(
      "Provider pack deployment unexpectedly claimed the stable Node path",
    );
  }
  const stableNodeCommand = join(stableNodeRoot, "bin", "node");
  mkdirSync(dirname(stableNodeCommand), { recursive: true, mode: 0o755 });
  copyFileSync(process.execPath, stableNodeCommand);
  chmodSync(stableNodeCommand, 0o755);
  // A freshly copied x64 Mach-O can stall when launched directly from a
  // translated Node process. Select Rosetta explicitly for this build probe;
  // native Intel and every other platform still execute the copied bytes directly.
  const translated = process.platform === "darwin" && process.arch === "x64"
    && spawnSync("/usr/sbin/sysctl", ["-n", "sysctl.proc_translated"], {
      encoding: "utf8", timeout: 1_000,
    }).stdout?.trim() === "1";
  const relocatedNode = spawnSync(translated ? "/usr/bin/arch" : stableNodeCommand,
    translated ? ["-x86_64", stableNodeCommand, "--version"] : ["--version"], {
    cwd: temporaryRoot, env: { PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: buildNodeStartupTimeout(),
  });
  if (relocatedNode.status !== 0 || relocatedNode.stdout.trim() !== `v${process.versions.node}`) {
    throw new Error("Provider pack Node is not portable after relocation; build with a standalone Node distribution");
  }

  const candidateProviders = {};
  for (const provider of providerPackProviders(process.platform, process.arch, candidates)) {
    const assetPath = `provider-assets/${provider}/${process.platform}-${process.arch}`;
    const metadata = await materializeCandidateProviderPack({ provider, outputRoot: join(temporaryRoot, assetPath) });
    if (typeof metadata?.version !== "string" || !metadata.version || metadata.version.length > 120
      || !/^sha256:[a-f0-9]{64}$/.test(metadata.profileDigest)
      || !/^sha256:[a-f0-9]{64}$/.test(metadata.closureDigest)) throw new Error("Candidate builder omitted its pinned identity");
    candidateProviders[provider] = { version: metadata.version, profileDigest: metadata.profileDigest,
      closureDigest: metadata.closureDigest, qualification: ["pi", "cursor", "copilot"].includes(provider) ? "qualified" : "pending", path: assetPath,
      sha256: sha256Tree(join(temporaryRoot, assetPath)) };
  }

  // Installer-generated .bin entries either embed the temporary deployment
  // directory (pnpm's NODE_PATH shims) or link into the package and run with
  // whatever Node is first on PATH (Bun). Replace every provider-facing entry
  // with a pack-relative launcher that always uses the pinned Node executable
  // owned by this pack.
  // The image exposes these same installations to every adapter. Never add a
  // separate global/runner-only CLI version; refresh these packages and their
  // qualification digests together to the latest stable releases.
  writePortableNodeShim("codex", "@openai/codex/bin/codex.js");
  const claudeAcpRequire = createRequire(
    packRequire.resolve("@agentclientprotocol/claude-agent-acp/package.json"),
  );
  // Use the ACP bridge's SDK dependency directly, avoiding a second peer-
  // resolved SDK installation just to expose its CLI on the global PATH.
  const sdkRequire = createRequire(claudeAcpRequire.resolve("@anthropic-ai/claude-agent-sdk"));
  const claudeExecutable = sdkRequire.resolve(
    `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`,
  );
  writePortableExecutableShim(
    temporaryRoot,
    "claude",
    relative(realpathSync(join(temporaryRoot, "node_modules")), realpathSync(claudeExecutable)),
  );
  writePortableExecutableShim(temporaryRoot, "node", "node/bin/node");
  writePortableExecutableShim(temporaryRoot, "opencode", "opencode-ai/bin/opencode.exe");
  writePortableCopilotShims(temporaryRoot);
  writePortableNodeShim("acpx", "acpx/dist/cli.js");
  writePortableNodeShim("paperclip-runner-copilot-metadata-probe", "../dist/cli/copilot-metadata-probe.js");
  writePortableNodeShim(
    "claude-agent-acp",
    "@agentclientprotocol/claude-agent-acp/dist/index.js",
  );
  writePortableNodeShim(
    "codex-acp",
    "@agentclientprotocol/codex-acp/dist/index.js",
  );

  assertPackIsSelfContained(temporaryRoot);

  for (const shimName of readdirSync(
    join(temporaryRoot, "node_modules", ".bin"),
  )) {
    const shimPath = join(temporaryRoot, "node_modules", ".bin", shimName);
    const contents = readFileSync(shimPath, "utf8");
    if (contents.includes(temporaryParent)) {
      throw new Error(
        `Provider pack shim ${shimName} retains its temporary build path`,
      );
    }
  }

  // Exercise a clean import from the deployed dependency graph. This catches
  // malformed patch hunks that can look correct in an existing package store but
  // land inside the wrong function when applied to a fresh acpx tarball.
  const acpxImport = spawnSync(
    join(temporaryRoot, "node_modules", "node", "bin", "node"),
    ["--input-type=module", "-e", 'await import("acpx/runtime")'],
    {
      cwd: temporaryRoot,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (acpxImport.status !== 0) {
    throw new Error(
      `Provider pack ACPX import failed: ${String(acpxImport.stderr ?? "")
        .trim()
        .slice(-2_000)}`,
    );
  }

  const opencodeProxyPath = "dist/cli/opencode-app-server-proxy.cjs";
  const acpxSidecarPath = "dist/cli/acpx-runtime-sidecar.cjs";
  const opencodeCommand = "node_modules/.bin/opencode";
  const opencodeExecutable = "node_modules/opencode-ai/bin/opencode.exe";
  const nodeCommand = "node_modules/node/bin/node";
  const productionLock = "bun.lock";
  copyFileSync(
    join(workspaceRoot, "bun.lock"),
    join(temporaryRoot, productionLock),
  );
  for (const relativePath of [
    nodeCommand,
    productionLock,
    opencodeProxyPath,
    acpxSidecarPath,
    opencodeCommand,
    opencodeExecutable,
  ]) {
    if (!existsSync(join(temporaryRoot, relativePath))) {
      throw new Error(`Provider pack is missing ${relativePath}`);
    }
  }

  const opencodeProxySha = sha256File(join(temporaryRoot, opencodeProxyPath));
  const acpxSidecarSha = sha256File(join(temporaryRoot, acpxSidecarPath));
  const distDigest = sha256Tree(join(temporaryRoot, "dist"));
  const configuredRevision =
    process.env.PAPERCLIP_RUNNER_SOURCE_REVISION?.trim();
  const revision =
    configuredRevision ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    }).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("PAPERCLIP_RUNNER_SOURCE_REVISION must be a full Git SHA");
  }
  const dirty = configuredRevision
    ? false
    : spawnSync("git", ["diff", "--quiet", "--", "packages/paperclip-runner"], {
        cwd: workspaceRoot,
      }).status !== 0;
  const payload = {
    pins: {
      nodeMinimum: minimumNodeVersion.join("."),
      codex: profiles.profiles.codex.agentRuntimeVersion,
      opencode: "1.18.34",
      acpx: profiles.acpxVersion,
      grok: profiles.profiles.grok.agentRuntimeVersion,
      claudeAcp: profiles.profiles.claude.agentServerVersion,
      codexAcp: profiles.profiles.codex.agentServerVersion,
    },
    target: { platform: process.platform, architecture: process.arch },
    runnerSourceRevision: `${revision}${dirty ? "-dirty" : ""}`,
    distDigest,
    bridgeDigest: `sha256:${createHash("sha256")
      .update(opencodeProxySha)
      .update("\n")
      .update(acpxSidecarSha)
      .update("\n")
      .update(distDigest)
      .digest("hex")}`,
    acpxProfileDigests: {
      grok: profiles.profiles.grok.commandDigest,
      claude:
        profiles.profiles.claude.commandDigest,
      codex:
        profiles.profiles.codex.commandDigest,
    },
    ...providerPackManifestFields(candidateProviders, candidates),
    artifacts: {
      grokLauncher: {
        path: "dist/providers/grok/launcher.cjs",
        sha256: sha256File(join(temporaryRoot, "dist/providers/grok/launcher.cjs")),
      },
      nodeCommand: {
        path: nodeCommand,
        sha256: sha256File(join(temporaryRoot, nodeCommand)),
      },
      productionLock: {
        path: productionLock,
        sha256: sha256File(join(temporaryRoot, productionLock)),
      },
      opencodeCommand: {
        path: opencodeCommand,
        sha256: sha256File(join(temporaryRoot, opencodeCommand)),
      },
      opencodeExecutable: {
        path: opencodeExecutable,
        sha256: sha256File(join(temporaryRoot, opencodeExecutable)),
      },
      opencodeProxy: {
        path: opencodeProxyPath,
        sha256: opencodeProxySha,
      },
      acpxSidecar: { path: acpxSidecarPath, sha256: acpxSidecarSha },
    },
  };
  const manifest = {
    schema: "paperclip-runner/remote-provider-pack/v1",
    digest: `sha256:${createHash("sha256")
      .update(canonicalJson(payload))
      .digest("hex")}`,
    payload,
  };
  writeFileSync(
    join(temporaryRoot, "provider-pack.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );

  rmSync(outputRoot, { recursive: true, force: true });
  renameSync(temporaryRoot, outputRoot);
  process.stdout.write(`${outputRoot}\n`);
} finally {
  rmSync(temporaryParent, { recursive: true, force: true });
}

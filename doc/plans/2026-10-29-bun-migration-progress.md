# Bun migration: progress notes (2026-10-29)

Branch `chore/bun`, worktree `/Users/achyarbagus/Kerja/socialagent-bun`.
Merge into `main` only after the Docker image builds and runs.

## Scope agreed

1. Package manager: pnpm → Bun 1.4.4 (`bun.lock`, isolated linker).
2. Server runtime: Node → Bun (`bun src/index.ts`, `bun --watch`).
3. Docker first. The 17 CI workflows stay on pnpm for now.

## Commits on `chore/bun`

- `5deb6eb9e` install the workspace with Bun
- `76100d1d0` run scripts, the dev runner and the server with Bun
- `9aa561ecd` run build, typecheck and test helpers through Bun
- `313c3877e` build and run the Docker image with Bun
- `317ef5896` make Bun the declared package manager and document it
- `92cce0fa2` copy `pnpm-workspace.yaml` into the Docker deps stage and align build tests

## Verified

- `bun install`: all 12 patched packages are byte-identical to the pnpm install.
- `bun run typecheck` and `bun run build` pass.
- `bun run dev`: the server runs 382 migrations, the API writes work and the UI loads.
- Vitest under Bun: 10,362 passed, 75 failed. The same failures appear on `main`
  under Node (SaaS features, the SocialAgent rebrand and model aliases changed
  behavior that older tests still assert). Not caused by Bun.
- `scripts/` node tests: 10 failures, all also failing on `main`.
- Bun-specific test breakage found and fixed (in `92cce0fa2`):
  `vite-build-commit`, `docker-build-stamp`, `server-package-build-script`,
  `docker-deps-postinstall`, `release-verify-workflow`, `run-vitest-stable-shard`.

## Docker build: status

- `docker build -t socialagent:bun --target production .` passes (image about 5.5 GB).
- Earlier failures:
  - The disk filled up (`EIO`).
  - Then `tsc` in the server build was OOM-killed (exit 137) on the 8 GB
    Docker VM. The cause is TypeScript 7 (native compiler, also on `main`):
    `NODE_OPTIONS` does not cap its memory. The Dockerfile now sets
    `compilerOptions.checkers` from `ARG TSC_CHECKERS=2` for the image build
    only. Local builds are unchanged.
- Smoke run passed:
  - `docker run -p 3199:3100 -e BETTER_AUTH_SECRET=... socialagent:bun`
  - The server runs on Bun, and embedded Postgres applies all migrations.
  - `/api/health` returns `ok`, and the UI returns 200.
- Dockerfile tests pass: 6 vitest files (47 tests) and 2 node test files (72 tests).

## Next steps

1. ~~Docker build and smoke run~~ (done).
2. ~~Merge `chore/bun` into `main` and push~~ (done, `519331e84`).
3. ~~CI on Bun~~ (done 2026-10-31): `.github/workflows/ci.yml` runs on `main`
   pushes and pull requests; Dependabot uses the `bun` ecosystem. The upstream
   workflows still use pnpm and should be disabled in the fork's Actions
   settings (`gh workflow disable`).
4. ~~Remove `pnpm-lock.yaml`~~ (done 2026-10-31). `scripts/provision-worktree*.sh`
   install with Bun when a checkout has `bun.lock` and fall back to pnpm for
   branches that still carry only `pnpm-lock.yaml`.
5. ~~Remote provider pack~~ (done 2026-10-31). `build-provider-pack.mjs`
   replaces `pnpm deploy` with `bun pm pack` plus a filtered
   `bun install --production --frozen-lockfile --linker=isolated` in a staged
   copy of the workspace, then moves the `node_modules/.bun` store into the pack.
   It trusts only the `esbuild` and `opencode-ai` lifecycle scripts, and it fails
   when a link points outside the pack. The pack ships `bun.lock` as its
   `productionLock`. `docker/daytona-runner/Dockerfile` and the
   `tests/runner-e2e` image-content inputs use Bun and `bun.lock`.
6. ~~Standalone installs~~ (done 2026-10-31). Repo-bundled standalone plugins
   (`plugin-loader.ts`) and `scripts/build-standalone-public-packages.mjs` install
   with `bun install --config=/dev/null`, so a plugin-supplied `bunfig.toml`
   cannot change the registry or install policy. A plugin that declares its own
   `trustedDependencies` installs with `--ignore-scripts`. A package with
   `bun.lock` installs with `--frozen-lockfile`; one without it uses `--no-save`.
   The Daytona sandbox provider ships `bun.lock` instead of `pnpm-lock.yaml`
   and its local `pnpm-workspace.yaml`. `paperclipai install` from a git ref
   builds a checkout that has `bun.lock` with Bun (`bun install`,
   `bun run build` over the server's workspace closure, `bun pm pack`). It
   keeps the corepack pnpm path for older refs that carry only
   `pnpm-lock.yaml`. Both paths now run `scripts/prepare-server-ui-dist.sh`
   before packing, because the server bundles its dependencies and is staged
   without its prepack (the git install failed on a missing `server/ui-dist`
   since the server gained `bundleDependencies`). That script builds the UI
   with Bun. Packages whose `files` list `skills` get a copy of the
   repository `skills/` before packing, as the release flow stages them.
   After the workspace build, the install sets every release package to the
   CLI version (`release-package-map.mjs set-version`) before it bundles the
   CLI and packs, as the release flow does. Without that step, the server's
   `workspace:*` edge to `@paperclipai/plugin-sdk` (1.0.0) was published as
   `0.3.1`. Staged bundled packages are packed with `npm pack --ignore-scripts`.
7. Still open:
   - The upstream runner workflows (`docker-runner-check.yml`,
     `runner-full-stack-e2e.yml`, ...) still hash `pnpm-lock.yaml`. Disable
     them with `gh workflow disable` (needs `gh auth login`).

## Notes

- Keep `pnpm-workspace.yaml`. The Copilot postinstall, plugin loader and
  workspace runtime use it to find the workspace root.
- The Runner release contract attests the SHA-256 of `patches/acpx@0.13.1.patch`.
  Bun uses a separate copy in `patches/bun/acpx@0.13.1.patch`.
- Embedded Postgres needs `trustedDependencies` in the root `package.json`.

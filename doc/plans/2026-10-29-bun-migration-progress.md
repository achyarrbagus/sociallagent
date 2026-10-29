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
2. Merge `chore/bun` into `main` and push.
3. Later:
   - move the CI workflows to Bun;
   - move standalone sandbox-provider installs and `paperclipai install` from a git checkout;
   - remove `pnpm-lock.yaml` once CI no longer needs it.

## Notes

- Keep `pnpm-workspace.yaml`. The Copilot postinstall, plugin loader and
  workspace runtime use it to find the workspace root.
- The Runner release contract attests the SHA-256 of `patches/acpx@0.13.1.patch`.
  Bun uses a separate copy in `patches/bun/acpx@0.13.1.patch`.
- Embedded Postgres needs `trustedDependencies` in the root `package.json`.

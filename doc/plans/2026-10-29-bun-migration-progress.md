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

- The first build passed `bun install --frozen-lockfile` in the deps stage.
- The second build failed at the global agent-CLI `npm install` step because the
  disk filled up (`EIO`, buildkit `metadata_v2.db: input/output error`). After
  that the Docker VM filesystem went read-only and the daemon hung.
- Still to do: once Docker responds (`docker version`), run the build again:

  ```sh
  cd /Users/achyarbagus/Kerja/socialagent-bun
  docker build -t socialagent:bun --target production .
  ```

  If the daemon still hangs after a reboot, use Docker Desktop → Troubleshoot →
  Clean / Purge data. Set Settings → Resources → Disk usage limit to about 40 GB.
  The build needs about 10–15 GB free on the Mac.

## Next steps

1. Docker build passes, then smoke-run the container
   (`docker run --rm -p 3100:3100 socialagent:bun`, then `curl /api/health`).
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

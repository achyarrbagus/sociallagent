# Tenant Sandbox Isolation (SaaS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SocialAgent safe to open to many organizations: every agent run executes in a per-run sandbox outside the server host, no tenant can reach another tenant's data or the operator's secrets, data lives in Supabase (Postgres + Storage) with its public API locked down, and users can upload only individual media and document files.

**Architecture:** One switch, `SOCIALAGENT_SAAS_MODE=true`, turns on every guard. Compute isolation comes from the existing sandbox-provider plugins (one ephemeral sandbox per run lease, local execution refused, fail closed). Supabase supplies isolation for *data*, not compute: Postgres replaces embedded Postgres, Storage is reached through the existing S3 provider, and Row Level Security with no policies closes Supabase's auto-generated Data API. The shared 9Router master key never enters a sandbox; sandboxes call a server-side gateway proxy with a run-scoped token.

**Tech Stack:** Bun server, Express, Drizzle/Postgres (Supabase), AWS SDK v3 S3 client (Supabase Storage S3 endpoint), sandbox-provider plugins (`packages/plugins/sandbox-providers/*`), Vitest.

**Spec:** this document plus the decisions recorded 2026-10-30: per-tenant sandbox isolation using Supabase; uploads are individual media/document files only, no folder upload, no ZIP.

## Background (current state, verified 2026-10-30)

- Runs pick an environment in `selectHeartbeatEnvironment` (`server/src/services/heartbeat/environment-selection.ts:85`). `instance_settings.experimental.enableManagedSandboxOnly` already redirects local runs to the managed sandbox and fails closed with `ManagedSandboxUnavailableError` (`:183-198`). Nothing ties it to SaaS mode.
- The SaaS lock (`server/src/routes/managed-ai-lock.ts:17`) only locks models and connectors when `SOCIALAGENT_9ROUTER_API_KEY` is set. It does not affect where code runs.
- `environments` has no `company_id`; the managed sandbox row is instance-wide (`environments.ts:19-27`, `findManagedSandboxEnvironment` ignores its company argument). Leases carry `company_id` (`environment_leases.ts:13`), and `resolveEnvironmentExecutionTarget` checks the lease company (`environment-execution-target.ts:258`).
- `managed-gateway.ts:233-236` stores the same `SOCIALAGENT_9ROUTER_API_KEY` as every company's shared connection, and `ai-connection-runtime.ts:225,347` writes it into the sandbox's Codex `auth.json`.
- Legacy local adapters spread the whole host env into the child (`claude-local/src/server/execute.ts:320,503,749`, `codex-local/.../execute.ts:736,1037`, `cursor-local/.../execute.ts:441`). `sanitizeInheritedPaperclipEnv` (`packages/adapter-utils/src/server-utils.ts:3528`) strips only `PAPERCLIP_*` and identity keys, so `DATABASE_URL`, `BETTER_AUTH_SECRET` and `SOCIALAGENT_9ROUTER_API_KEY` pass through.
- No table has Row Level Security. Isolation is application code only (`assertCompanyAccess`, `server/src/routes/authz.ts:111`).
- Storage already supports S3 (`server/src/storage/s3-provider.ts`, config `PAPERCLIP_STORAGE_S3_*` in `server/src/config.ts:170-187`) and keys every object `${companyId}/…` with prefix checks (`storage/service.ts:47-70`).
- Project files offer folder upload through `webkitdirectory` (`ui/src/components/ProjectFilesPanel.tsx:16`, `NewProjectDialog.tsx:21`). The issue-attachment allowlist includes `application/zip` and `text/html` (`server/src/attachment-types.ts:33,38`). Attachments are buffered in memory (`multer.memoryStorage()`, `routes/issues.ts:4826`).
- The code uses `LISTEN` and `pg_try_advisory_lock`, which need a direct or session-mode Postgres connection, not Supabase's transaction pooler (port 6543).

## Global Constraints

- One switch: `SOCIALAGENT_SAAS_MODE=true`. Every guard in this plan keys off `config.saasMode`; none may be enabled by a different flag in SaaS deployments.
- SaaS mode never executes agent code on the server host. When no active managed sandbox exists, runs fail with `ManagedSandboxUnavailableError`; they never fall back to local.
- `SOCIALAGENT_9ROUTER_API_KEY` must never appear in a sandbox's environment, files, or command line.
- Server-held secrets that must never reach any agent child process, local or remote: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, every `SOCIALAGENT_*`, every `PAPERCLIP_STORAGE_*`, every `AWS_*`, every `SUPABASE_*`.
- Supabase Postgres: `DATABASE_URL` uses a direct connection or the Supavisor **session** pooler; port 6543 (transaction pooler) is rejected at startup. `DATABASE_MIGRATION_URL` is a direct connection.
- Supabase Storage bucket is private. The server is the only client; browsers never receive Supabase keys.
- SaaS upload allowlist (MIME): `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `video/quicktime`, `video/webm`, `application/pdf`, `text/plain`, `text/markdown`, `text/csv`, Office documents (`.docx`, `.xlsx`, `.pptx`). Never `application/zip` or any archive, `text/html`, `image/svg+xml`.
- Size caps in SaaS mode: 10 MB per non-video file (existing `PAPERCLIP_ATTACHMENT_MAX_BYTES`), 100 MB per video (`SOCIALAGENT_VIDEO_MAX_BYTES`, default `104857600`).
- No folder upload and no archive upload anywhere in SaaS mode; one file per request.
- Every new mutation writes an activity log entry; every new endpoint applies company access checks (AGENTS.md §8).
- Update `maps/` entries for changed access and run `node scripts/check-maps.mjs` in the task that changes them.

## Review Focus

1. **A sandbox lease reused by another organization.** Two companies running at the same time must get distinct provider sandboxes; a released lease is destroyed, never handed to the next company. Pinned in Task 3.
2. **A run-scoped gateway token used after its run ends, or by another company's run.** Both must get 401 from the proxy. Pinned in Task 4.
3. **An agent that was configured before SaaS mode was switched on** (default environment = local, or adapter `process`/`http`, or legacy engine). The next run must be redirected to the sandbox or refused, not executed locally. Pinned in Tasks 1 and 2.
4. **A file renamed to dodge the allowlist** (`report.pdf` that is really a ZIP or HTML). The server must judge the declared and sniffed content type, not the extension. Pinned in Task 8.
5. **A table added by a future migration without RLS.** The schema test must fail until RLS is enabled. Pinned in Task 6.

---

### Task 1: SaaS mode switch and fail-closed sandbox execution

**Files:**
- Modify: `server/src/config.ts` (add `saasMode`)
- Modify: `server/src/services/heartbeat/environment-selection.ts:183-198`
- Modify: `server/src/index.ts` (startup check)
- Modify: `.env.example`, `doc/DEVELOPING.md`
- Test: `server/src/services/heartbeat/environment-selection.test.ts`

**Interfaces:**
- Produces: `config.saasMode: boolean` from `SOCIALAGENT_SAAS_MODE === "true"`; `isSaasMode(): boolean` exported from `server/src/config.ts` for code without the config object.

- [x] **Step 1: Write the failing tests** in `environment-selection.test.ts`:
  - `it("selects the managed sandbox in SaaS mode even when the agent default is local")`: with `saasMode` true, `enableManagedSandboxOnly` false, agent `defaultEnvironmentId` = local env id, an active `sandbox` environment → selected environment id is the sandbox id.
  - `it("fails closed in SaaS mode when no managed sandbox is active")` → rejects with `ManagedSandboxUnavailableError`.
- [x] **Step 2: Run** `cd server && npx vitest run src/services/heartbeat/environment-selection.test.ts` → both FAIL.
- [x] **Step 3: Implement.** In `selectHeartbeatEnvironment`, `managedSandboxOnly = saasMode || experimental.enableManagedSandboxOnly === true`. At startup, when `saasMode` is true and `findManagedSandboxEnvironment()` returns null, log an error naming the missing sandbox environment (do not exit; runs already fail closed).
- [x] **Step 4: Run** the test file → PASS.
- [x] **Step 5: Commit** `feat(saas): force managed sandbox execution in SaaS mode`.

### Task 2: Refuse host-executing adapters and engines in SaaS mode

**Files:**
- Modify: `server/src/routes/agents.ts` (hire and patch validation near `:3365`)
- Modify: `server/src/services/heartbeat/runtime-selection.ts:504-525` (admission guard)
- Test: `server/src/__tests__/environment-selection-route-guards.test.ts`

**Interfaces:**
- Consumes: `config.saasMode` (Task 1).
- Produces: `assertSaasExecutionAllowed(agent: { adapterType: string; adapterConfig: unknown }): void` in `server/src/services/saas-execution-policy.ts`; throws `unprocessable("This agent type cannot run in SaaS mode")` for adapter types `process`, `http`, and any agent whose resolved engine is the legacy CLI engine.

- [x] **Step 1: Write the failing tests:** hiring an agent with `adapterType: "process"` in SaaS mode → 422; patching an existing agent to `engine: "cli"` → 422; a pre-existing `process` agent's run is refused at admission with the same message and never spawns a process (assert no `processPid` recorded).
- [x] **Step 2: Run** `cd server && npx vitest run src/__tests__/environment-selection-route-guards.test.ts` → FAIL.
- [x] **Step 3: Implement** `assertSaasExecutionAllowed` and call it from the hire/patch routes and before dispatch in runtime selection.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(saas): refuse host-executing agents in SaaS mode`.

### Task 3: One ephemeral sandbox per run lease, never shared across companies

**Files:**
- Modify: `server/src/services/environment-runtime.ts` (lease acquire/reuse)
- Test: `server/src/__tests__/project-workspace-managed-sandbox-routes.test.ts` (or a new `server/src/__tests__/sandbox-lease-isolation.test.ts`)

**Interfaces:**
- Consumes: `config.saasMode`.
- Produces: in SaaS mode the effective lease policy for `driver: "sandbox"` and `driver: "plugin"` environments is `"ephemeral"` regardless of environment config; lease reuse requires `lease.companyId === run.companyId`.

- [x] **Step 1: Write the failing tests** with a fake sandbox provider that records `onEnvironmentAcquireLease` calls:
  - `it("acquires distinct provider sandboxes for concurrent runs of two companies")`: two companies, one run each, started together → two acquire calls, two different provider lease ids.
  - `it("destroys a released SaaS lease instead of retaining it for reuse")`: after release → `onEnvironmentDestroyLease` called; a following run of another company acquires a new lease.
  - `it("forces the ephemeral policy in SaaS mode when the environment asks to retain")`.
- [x] **Step 2: Run** → FAIL on the policy and destroy assertions.
- [x] **Step 3: Implement** the policy override and the company check on reuse.
- [x] **Step 4: Run** → PASS.
- [x] **Step 5: Commit** `feat(saas): one ephemeral sandbox per run lease`.

### Task 4: Run-scoped gateway proxy so the 9Router master key stays on the server

**Files:**
- Create: `packages/db/src/schema/managed_gateway_tokens.ts` (+ export in `schema/index.ts`, migration via `bun run db:generate`)
- Create: `server/src/services/managed-gateway-tokens.ts`
- Create: `server/src/routes/managed-gateway-proxy.ts` (mounted in `server/src/app.ts`)
- Modify: `server/src/services/ai-connection-runtime.ts:225,347` (write token + proxy URL instead of the master key)
- Modify: `server/src/config.ts` (`SOCIALAGENT_PUBLIC_URL`, the server URL sandboxes can reach)
- Test: `server/src/__tests__/managed-gateway-proxy.test.ts`

**Interfaces:**
- Produces:
  - Table `managed_gateway_tokens`: `id uuid pk`, `company_id uuid not null fk companies`, `run_id uuid not null`, `token_hash text not null unique`, `expires_at timestamptz not null`, `revoked_at timestamptz`, `created_at`.
  - `issueRunGatewayToken(db, { companyId, runId, expiresAt }): Promise<string>` returns the plaintext token once; stores only its SHA-256 hash.
  - `revokeRunGatewayTokens(db, runId): Promise<void>`, called when the run reaches a terminal status.
  - Route `ALL /api/managed-gateway/v1/*`: `Authorization: Bearer <token>`; valid only when unexpired, unrevoked and the run is non-terminal; forwards method, path and body to `SOCIALAGENT_9ROUTER_BASE_URL` with the master key; streams the response back.
- [x] **Step 1: Write the failing tests** (upstream mocked with a local HTTP server):
  - valid token for an active run → request reaches upstream with `Authorization: Bearer <master key>` and the client response is streamed back;
  - token after the run is terminal → 401, upstream not called;
  - unknown or expired token → 401;
  - `it("never writes the master key into the sandbox auth file")`: build the runtime for a managed agent in SaaS mode and assert the generated `auth.json` and env contain the run token and `SOCIALAGENT_PUBLIC_URL/api/managed-gateway/v1`, and do not contain the master key string.
- [x] **Step 2: Run** `cd server && npx vitest run src/__tests__/managed-gateway-proxy.test.ts` → FAIL.
- [x] **Step 3: Implement** schema, migration (`bun run db:generate`, then make the SQL idempotent like 0383), token service, proxy route, runtime change, and revocation on run terminalization.
- [x] **Step 4: Run** the test file and `npx vitest run packages/db/src/migration-snapshot-drift.test.ts` → PASS.
- [x] **Step 5: Update** `maps/agent-access-map/` for the new endpoint and run `node scripts/check-maps.mjs`.
- [x] **Step 6: Commit** `feat(saas): run-scoped gateway proxy keeps the 9Router key on the server`.

### Task 5: Strip server secrets from every agent child process

**Files:**
- Modify: `packages/adapter-utils/src/server-utils.ts:3528` (`sanitizeInheritedPaperclipEnv`)
- Modify: `server/src/services/native-runtime/native-session-executor.ts:858-868` (`resolveNativeProviderEnvironment` must not return all of `process.env`)
- Test: `packages/adapter-utils/src/server-utils-env.test.ts`, `server/src/services/native-runtime/native-session-executor.test.ts`

**Interfaces:**
- Produces: `SERVER_SECRET_ENV_PATTERNS: readonly RegExp[]` exported from `server-utils.ts`, matching exactly the Global Constraints secret list; `sanitizeInheritedPaperclipEnv` removes every match.

- [x] **Step 1: Write the failing tests:** `sanitizeInheritedPaperclipEnv({ DATABASE_URL: "x", BETTER_AUTH_SECRET: "x", SOCIALAGENT_9ROUTER_API_KEY: "x", AWS_SECRET_ACCESS_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", PATH: "/bin" })` returns `{ PATH: "/bin" }`; `resolveNativeProviderEnvironment` with `configured` undefined returns no key matching the patterns.
- [x] **Step 2: Run** `npx vitest run packages/adapter-utils/src/server-utils-env.test.ts` → FAIL.
- [x] **Step 3: Implement** the patterns and apply them in both places.
- [x] **Step 4: Run** both test files → PASS.
- [x] **Step 5: Commit** `fix(security): never pass server secrets to agent processes`.

### Task 6: Supabase Postgres connection rules and Data API lockdown

**Files:**
- Modify: `packages/db/src/client.ts` (URL validation)
- Create: migration enabling RLS (hand-written SQL appended by `bun run db:generate --custom` or the repo's custom-migration path)
- Create: `packages/db/src/rls-coverage.test.ts`
- Modify: `doc/DATABASE.md` (Supabase section), `.env.example`

**Interfaces:**
- Produces: `assertSessionCapableDatabaseUrl(url: string): void` in `packages/db/src/client.ts`; throws `"DATABASE_URL points at a transaction pooler (port 6543); use a direct or session-pooler connection"` when the port is 6543 or the URL has `pgbouncer=true`.

- [x] **Step 1: Write the failing tests:**
  - `assertSessionCapableDatabaseUrl("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres")` throws; port 5432 passes.
  - `it("enables row level security on every public table")`: after migrations on embedded Postgres, `select relname from pg_class join pg_namespace n on n.oid = relnamespace where n.nspname = 'public' and relkind = 'r' and not relrowsecurity` returns no rows.
  - `it("keeps the server role able to read and write")`: the owner connection inserts and selects a company row.
- [x] **Step 2: Run** `npx vitest run packages/db/src/rls-coverage.test.ts` → FAIL.
- [x] **Step 3: Implement:** call the validator in `createDb`; migration loops over `pg_tables where schemaname = 'public'` and runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (no policies, no `FORCE`, so the owning server role bypasses RLS while Supabase `anon`/`authenticated` see nothing); when roles `anon` and `authenticated` exist, `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`. Document: disable the Supabase Data API for the project, use a session/direct URL, set `DATABASE_MIGRATION_URL` to the direct connection.
- [x] **Step 4: Run** the test file and the drift test → PASS.
- [x] **Step 5: Commit** `feat(saas): Supabase-safe connections and RLS lockdown`.

### Task 7: Supabase Storage through the S3 provider

**Files:**
- Modify: `server/src/storage/s3-provider.ts` (explicit credentials option)
- Modify: `server/src/config.ts:170-187` (`PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID`, `PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY`)
- Create: `server/scripts/storage-smoke.ts` (+ `"storage:smoke"` in root `package.json`)
- Modify: `doc/DEVELOPING.md` or `docs/deploy/` storage section
- Test: `server/src/__tests__/storage-s3-multipart.test.ts`

**Interfaces:**
- Produces: when both new keys are set, the S3 client uses them instead of the default AWS chain (so no `AWS_*` variables need to exist in the server env); `storage:smoke` does put → head → get → delete of one object under a throwaway company prefix and exits non-zero on any mismatch.

- [x] **Step 1: Write the failing test:** constructing the provider with explicit keys passes `credentials: { accessKeyId, secretAccessKey }` to the client (spy on the client constructor).
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement** the option and the smoke script. Document Supabase values: `PAPERCLIP_STORAGE_PROVIDER=s3`, `PAPERCLIP_STORAGE_S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3`, `PAPERCLIP_STORAGE_S3_REGION=<project region>`, `PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE=true`, private bucket, S3 access keys from the Supabase dashboard; the project's per-file upload limit must be at least `SOCIALAGENT_VIDEO_MAX_BYTES`.
- [x] **Step 4: Run** the test → PASS; run `bun run storage:smoke` against a Supabase project → prints `ok`.
- [x] **Step 5: Commit** `feat(saas): Supabase Storage via the S3 provider`.

### Task 8: Upload policy — individual media and document files only

**Files:**
- Modify: `server/src/attachment-types.ts` (SaaS allowlist + video cap)
- Modify: `server/src/routes/issues.ts:4826` and `server/src/routes/project-files.ts:41` (enforce, reject path separators in SaaS)
- Modify: `server/src/routes/companies.ts:89` (company import ZIP: instance admin only in SaaS mode)
- Modify: `ui/src/components/ProjectFilesPanel.tsx:16`, `ui/src/components/NewProjectDialog.tsx:21`, `ui/src/lib/project-file-upload.ts` (no folder picker in SaaS mode)
- Test: `server/src/__tests__/attachment-types.test.ts`, `server/src/__tests__/project-files-routes.test.ts`, `ui/src/components/ProjectFilesPanel.test.tsx`

**Interfaces:**
- Consumes: `config.saasMode`; the UI reads it from the existing health/instance payload as `saasMode: boolean`.
- Produces: `SAAS_ALLOWED_TYPES: readonly string[]` (Global Constraints list); `effectiveAllowedTypes(saasMode: boolean): string[]`; `maxUploadBytes(contentType: string, saasMode: boolean): number` (video → `SOCIALAGENT_VIDEO_MAX_BYTES`, else `MAX_ATTACHMENT_BYTES`).

- [x] **Step 1: Write the failing tests:**
  - SaaS mode rejects `application/zip`, `application/x-zip-compressed`, `text/html`, `image/svg+xml` with 422; accepts `video/mp4` at 50 MB; rejects `video/mp4` above `SOCIALAGENT_VIDEO_MAX_BYTES`.
  - `it("judges a renamed archive by its bytes")`: a file named `brief.pdf` with declared type `application/pdf` but ZIP magic bytes (`50 4B 03 04`) → 422.
  - Project files in SaaS mode: filename `assets/logo.png` → 422 ("Folders are not supported"); `logo.png` → 201.
  - Company import ZIP by a non-admin board user in SaaS mode → 403.
  - UI: `ProjectFilesPanel` in SaaS mode renders no input with a `webkitdirectory` attribute.
- [x] **Step 2: Run** the three test files → FAIL.
- [x] **Step 3: Implement** the allowlist, a small magic-byte sniff for PDF (`%PDF`), PNG, JPEG, GIF, WebP, MP4/QuickTime (`ftyp`), WebM (`1A 45 DF A3`) and ZIP-based Office files (allowed only when the declared type is an Office type), the path-separator rejection, the import gate, and the UI flag.
- [x] **Step 4: Run** the tests and `bun run check:token-gates` → PASS.
- [x] **Step 5: Update** `maps/feature-map/` upload entries; run `node scripts/check-maps.mjs`.
- [x] **Step 6: Commit** `feat(saas): individual media and document uploads only`.

### Task 9: Hand-off verification

- [ ] **Step 1:** `bun run typecheck`, `bun run test:run`, `bun run build`. Compare failures with the 10 known pre-existing failures (ai-connections ×4, plugin-install-autobuild ×3, workspace-runtime ×2, runner-api ×1); anything else blocks hand-off.
- [ ] **Step 2:** Live check on a staging instance with `SOCIALAGENT_SAAS_MODE=true`, Supabase Postgres + Storage and one sandbox provider (Daytona or E2B): two organizations each run a task; confirm two distinct sandboxes in the provider console, each run settles accounting, credit charges appear, and `env`/`cat ~/.codex/auth.json` from inside a sandbox show no master key and no server secret.
- [ ] **Step 3:** Record results in the PR or issue, not in a shared journal.

## Out of scope (separate plans)

- Kubernetes per-company namespaces (`packages/plugins/sandbox-providers/kubernetes`, alpha) as an alternative compute backend.
- Per-company `company_id` on `environments` (BYO sandbox accounts per tenant).
- Streaming uploads instead of `multer.memoryStorage()`; until then the 100 MB video cap bounds server memory per request.
- Payments and plan-based allowances.

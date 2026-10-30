---
title: SaaS Mode
summary: Running one SocialAgent instance for many tenant companies
---

SaaS mode turns one SocialAgent (Paperclip) instance into a multi-tenant
service. One switch turns on every guard:

```sh
SOCIALAGENT_SAAS_MODE=true
```

No other flag enables these guards in a SaaS deployment, and none of them can
be turned off one at a time while SaaS mode is on.

## What SaaS Mode Guarantees

- **No agent code runs on the server host.** Every run goes to the managed
  sandbox environment. When no active managed sandbox exists, runs fail with
  `ManagedSandboxUnavailableError`. They never fall back to local execution.
  Agents configured before SaaS mode was turned on (local default environment,
  `process`/`http` adapters, legacy engine) are redirected to the sandbox or
  refused.
- **One sandbox per run, never shared across companies.** Leases are forced to
  the ephemeral policy and are destroyed at release. A reusable lease is resumed
  only for the company that owns it. When a sandbox provider cannot verify
  destroy, the lease is released instead, a warning is logged, and the lease
  metadata records `saasDestroyFallback: "release"`.
- **The 9Router key never enters a sandbox.** Managed runs receive a run-scoped
  token and the proxy URL `<SOCIALAGENT_PUBLIC_URL>/api/managed-gateway/v1`.
  The token is valid only while its run is active, and only for its own company.
  The proxy forwards only `GET` and `POST` inference calls (`responses`,
  `chat/completions`, `completions`, `messages`, `models`, `embeddings`, and
  their subpaths). Every other path, including the 9Router dashboard, key and
  admin APIs, returns `404`. At startup, stored managed connection credentials
  are replaced with the placeholder `managed-gateway-proxied`.
- **Server secrets never reach an agent process.** Host-inherited environment
  variables are filtered before a local child starts. Sandbox install and probe
  commands receive only the agent's explicit configured environment plus
  `PATH`/`HOME`. See [Agent environment](#agent-environment).
- **Uploads are individual media and document files only.** The allowed types
  are PNG, JPEG, WebP, GIF, MP4, QuickTime, WebM, PDF, plain text, Markdown,
  CSV, and Office documents (`.docx`, `.xlsx`, `.pptx`). Archives, HTML and SVG
  are always refused, and so are folder uploads. The server checks the file
  bytes against the declared type. For example, a renamed ZIP is refused, and an
  Office file must contain an OOXML `[Content_Types].xml` entry.
- **The Supabase Data API sees nothing.** Row level security is enabled on every
  `public` table with no policies (migration `0386_rls_lockdown`), and the
  `anon`/`authenticated` roles lose their grants.

## Environment Variable Reference

### SaaS and managed AI

| Variable | Default | Description |
|----------|---------|-------------|
| `SOCIALAGENT_SAAS_MODE` | `false` | `true` turns on every SaaS guard described above. |
| `SOCIALAGENT_PUBLIC_URL` | (unset) | Required in SaaS mode. This is the server origin that sandboxes can reach. Managed runs call `<url>/api/managed-gateway/v1`. It must use `https`. Plain `http` is accepted only for `localhost`, `127.0.0.1` or `::1`. When the value is missing or invalid, the server logs an error at startup and managed 9Router runs refuse to start. |
| `SOCIALAGENT_VIDEO_MAX_BYTES` | `104857600` (100 MB) | Per-video upload cap in SaaS mode. The value must be a positive integer number of bytes. Any other value falls back to the default and logs one warning. Other files stay capped by `PAPERCLIP_ATTACHMENT_MAX_BYTES` (default 10 MB). |
| `SOCIALAGENT_9ROUTER_API_KEY` | (unset) | The operator's 9Router master key. It is held only by the server, and sandboxes never receive it. When it is set, onboarding connects new companies to the managed gateway. |
| `SOCIALAGENT_9ROUTER_BASE_URL` | (unset) | The 9Router base URL, including `/v1`, for example `https://9router.example.com/v1`. |
| `SOCIALAGENT_9ROUTER_ADAPTER` | `claude_local` | The adapter that onboarding assigns to new agents (`claude_local` or `codex_local`). |
| `SOCIALAGENT_9ROUTER_CLAUDE_MODEL` | (unset) | The default model for Claude agents on the managed gateway. |
| `SOCIALAGENT_9ROUTER_CODEX_MODEL` | (unset) | The default model for Codex agents on the managed gateway. |
| `SOCIALAGENT_MAX_COMPANIES_PER_USER` | `1` | The number of companies a signed-up user can create themselves in SaaS mode. |
| `SOCIALAGENT_SMTP_URL`, `SOCIALAGENT_MAIL_FROM`, `SOCIALAGENT_REQUIRE_EMAIL_VERIFICATION` | (unset) | Account email settings (see `.env.example`). |

### Storage (Supabase Storage through the S3 provider)

| Variable | Description |
|----------|-------------|
| `PAPERCLIP_STORAGE_PROVIDER` | Set this to `s3`. |
| `PAPERCLIP_STORAGE_S3_ENDPOINT` | `https://<project-ref>.supabase.co/storage/v1/s3` |
| `PAPERCLIP_STORAGE_S3_REGION` | The project region. |
| `PAPERCLIP_STORAGE_S3_BUCKET` | The name of a **private** bucket. |
| `PAPERCLIP_STORAGE_S3_PREFIX` | An optional key prefix. |
| `PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE` | Set this to `true` for Supabase. |
| `PAPERCLIP_STORAGE_S3_ACCESS_KEY_ID` | The S3 access key from Supabase (Storage > S3 Connection). Set both keys or neither; setting only one of the two fails at startup. When both are set, they replace the AWS credential chain, so the server needs no `AWS_*` variables. |
| `PAPERCLIP_STORAGE_S3_SECRET_ACCESS_KEY` | The secret for the access key above. |

See [Storage](/deploy/storage) for details.

### Database

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | The runtime connection. Use a direct connection or the Supavisor **session** pooler (port `5432`). The server rejects port `6543` (transaction pooler) and `pgbouncer=true` at startup. |
| `DATABASE_MIGRATION_URL` | Optional. This is the connection used for schema migrations, and it must be a direct connection. The same pooler rules apply. |

**Runtime role requirement.** RLS is enabled with no policies, so the
`DATABASE_URL` role must own the tables (the role that ran the migrations), or
have `BYPASSRLS`. Superusers also pass. Any other role reads zero rows. After
migrations, the server checks this condition and refuses to start with
`Database role "<role>" does not own public.companies and lacks BYPASSRLS`.
Supabase's default `postgres` role owns the tables it migrated. See
[Database](/deploy/database) and `doc/DATABASE.md` ("Data API lockdown").

### Agent environment

Agent processes never receive these host variables, in any mode:
`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, every
`SOCIALAGENT_*`, every `PAPERCLIP_STORAGE_*`, `PAPERCLIP_AGENT_JWT_SECRET`,
`PAPERCLIP_SECRETS_MASTER_KEY(_FILE)`, `PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN`,
`PAPERCLIP_WORKSPACE_HANDOFF_SECRET`, `PAPERCLIP_TOOL_OAUTH_*_CLIENT_SECRET`,
any `*_SIGNING_SECRET`, and the sandbox provider keys `DAYTONA_API_KEY`,
`E2B_API_KEY`, `NOVITA_API_KEY`, `CREATEOS_API_KEY` and `EXE_API_KEY`.

`AWS_*` and `SUPABASE_*` are stripped from the host-inherited environment
**only in SaaS mode**. Outside SaaS mode, self-hosted agents inherit them as
before, for example for Bedrock. In SaaS mode, an agent that needs AWS or
Supabase credentials must have them bound explicitly on the agent (adapter env
or a bound secret). Explicitly configured agent variables are never stripped.

## Go-Live Checklist

Complete every item before you set `SOCIALAGENT_SAAS_MODE=true` on a live
instance:

1. **Rotate the 9Router key.** Agents that ran before SaaS mode could read the
   master key, so treat it as exposed. Issue a new key in 9Router, set
   `SOCIALAGENT_9ROUTER_API_KEY`, and revoke the old key.
2. **Disable the Supabase Data API** (Project Settings > Data API). This is
   defence in depth on top of RLS.
3. **Make the storage bucket private.** The server is the only client.
4. **Raise the Supabase per-file upload limit** (Storage settings) to at least
   `SOCIALAGENT_VIDEO_MAX_BYTES`. Otherwise, large videos fail at Supabase.
5. **Set `SOCIALAGENT_PUBLIC_URL`** to an `https` origin that sandboxes can
   reach. Test it from inside a sandbox, for example
   `curl -sI <url>/api/health`.
6. **Configure an active managed sandbox environment.** Without one, every run
   fails closed. The server logs an error at startup when none exists.
7. **Release or destroy retained `reuse_by_environment` leases** before you
   turn on SaaS mode. Leases retained under the old policy are not swept
   automatically. List them with:
   ```sql
   select id, company_id, provider, status from environment_leases
   where lease_policy = 'reuse_by_environment'
     and status in ('active', 'released', 'retained', 'pending_cleanup');
   ```
   A released reusable lease can still keep its provider sandbox alive for a
   later resume. Destroy each sandbox at the provider, or through the
   environment UI or API, before you enable SaaS mode.
8. **Check the database role.** `DATABASE_URL` must use a session-capable URL
   and a role that owns the tables or has `BYPASSRLS`. The startup checks
   enforce both requirements.
9. **Run the storage smoke test** against the production storage settings:
   ```sh
   bun run storage:smoke
   ```
   It prints `ok` on success.

## Roll-Back

To turn SaaS mode off again:

1. Unset `SOCIALAGENT_SAAS_MODE` (or set it to `false`) and restart. Local and
   self-hosted execution paths become available again, and `AWS_*`/`SUPABASE_*`
   are inherited by local agents again.
2. **Re-key the managed connections.** In SaaS mode, the startup scrub replaced
   every stored managed 9Router connection credential with the placeholder
   `managed-gateway-proxied`. It also overwrote older secret versions, so the
   previous keys cannot be recovered. Outside SaaS mode the proxy does not
   apply, so an instance admin must enter a real 9Router key on each managed
   connection. Until then, managed runs fail authentication at 9Router.
3. Sandbox leases destroyed in SaaS mode are gone. New runs acquire new leases
   under the environment's own policy.

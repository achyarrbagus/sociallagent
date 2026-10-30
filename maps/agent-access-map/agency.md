# Creative agency — agent access

Product map: [Creative agency](../feature-map/agency.md).

Feature ID: `agency`.

Review date: 2026-10-25. Source: implementation working tree; no live agent proof.

## `profiles`

Capability ID: `agency/profiles`.

Review: `baseline`.

API: `present` — `GET /api/companies/{companyId}/agency`,
`GET /api/companies/{companyId}/agency/clients`,
`GET /api/companies/{companyId}/agency/brands`,
`POST /api/companies/{companyId}/agency/clients`,
`POST /api/companies/{companyId}/agency/brands`,
`PATCH /api/companies/{companyId}/agency/clients/{id}` and
`PATCH /api/companies/{companyId}/agency/brands/{id}`.

Agent access: `partial` — company-scoped GETs support bearer REST, with OpenAPI
discovery for generic API access where enabled. Mutations are
`operator-only`: agents request owner edits through ordinary tasks. No dedicated
native agency tool or universal generic-API availability is claimed.

Policy: Reads use company authorization and responsible-user intersection.
Writes require active human company owner or trusted local implicit board; agent
roles and instance-admin privileges alone do not qualify. New brands require an
active same-company client. Profiles are company-readable, including archived data.

Evidence: `source-only` — [routes](../../server/src/routes/agency.ts),
[service](../../server/src/services/agency.ts), and
[API/database tests](../../server/src/__tests__/agency.integration.test.ts).

Verification: `not-run` — actual bearer-agent execution remains unverified; tests
use injected authenticated actor context and a real disposable database.

Gaps: Brand-specific ACLs, profile revision history and portability are not added.

## `campaigns`

Capability ID: `agency/campaigns`.

Review: `baseline`.

API: `present` — existing `POST /api/companies/{companyId}/projects` and
`PATCH /api/projects/{id}` accept optional nullable `brandId`.

Agent access: `partial` — authorized REST/API fallback can bind projects. Existing
dedicated native project tool input coverage for brandId is not claimed.

Policy: Existing project write/privacy permissions apply. New bindings require
active same-company brand/client; null clears, omission retains. Linking does not
grant project or brand access to additional actors.

Evidence: `source-only` — [project service](../../server/src/services/projects.ts),
[project routes](../../server/src/routes/projects.ts), and agency database tests.

Verification: `not-run` — real-agent journey remains unverified.

Gaps: Dedicated native project tool brand binding and subsequent content workflow.

## `team`

Capability ID: `agency/team`.

Review: `baseline`.

API: `present` — `GET /api/teams/catalog` and existing team preview/install surfaces;
see [catalog access](./teams.md) for the operation-level contract.

Agent access: `partial` — installation retains existing team/agent creation and
governance rules. Installed roles receive brand-scoped assigned tasks; agents with
REST access can read profiles, otherwise the owner supplies authorized briefs.

Onboarding routes: `POST /api/companies/{companyId}/onboarding/agency-team` installs
the default `agency-core` team under the Agency Director. Board only, requires
`agents:create`; agents are denied. `POST /api/companies/{companyId}/onboarding-seed`
is the onboarding seed receiver (company access); it installs the team as a side
effect only for a board user who passes the same `agents:create` gate, and for any
other actor applies the seed without the team and reports `agencyTeam.status:
"failed"`. Both are idempotent, a partial team is reported as failed rather than
reinstalled, and failures are logged as `company.agency_core_team_install_failed`.
`GET /api/companies/{companyId}/onboarding/managed-gateway` reports whether the
instance-managed 9Router gateway is configured (board, company access; never
returns the key). `POST` on the same path creates or reuses the company's
shared 9Router AI connection; it uses the shared AI connection create gate,
denies agents and viewers, and logs `ai_connection.connected`.
In SaaS mode (`SOCIALAGENT_SAAS_MODE=true`) a run on that connection never
receives the 9Router key: it gets a run-scoped token and
`SOCIALAGENT_PUBLIC_URL/api/managed-gateway/v1`. `ALL
/api/managed-gateway/v1/*` is mounted before actor middleware and accepts only
that bearer token (stored as a SHA-256 hash, bound to one company; a `run`
token needs its heartbeat row in that company to exist and be
queued/running, a `probe` token lives at most 15 minutes; 401 `Invalid or
expired gateway token` otherwise). Paths that leave the gateway base (`..`,
`%2e%2e`, `\`, `%5c`) get 400. Only `GET`/`POST` on the inference paths
`responses`, `chat/completions`, `completions`, `messages`, `models` and
`embeddings` (with subpaths, optionally behind `v1/`) are forwarded; any other
method or path (dashboard, keys, admin) gets 404 `Not found` before any
upstream call. It forwards method, path, query and body (20 MB limit) to `SOCIALAGENT_9ROUTER_BASE_URL` with the server's key and
streams the response. Board sessions and agent API keys are not accepted.
In SaaS mode the company's stored managed credential is the placeholder
`managed-gateway-proxied` (startup overwrites every stored version that held
the key and logs `managed_gateway.stored_key_scrubbed` per secret), the agent
secret-value route refuses a value containing the key (403
`managed_gateway_key_refused`), and a run whose resolved
configuration contains the key is refused with 422
`managed_gateway_key_exposed`. Issuance and revocation (on terminal run status) log
`managed_gateway.token_issued` / `managed_gateway.tokens_revoked`. See
[proxy](../../server/src/routes/managed-gateway-proxy.ts),
[tokens](../../server/src/services/managed-gateway-tokens.ts) and
[tests](../../server/src/__tests__/managed-gateway-proxy.test.ts).
With the gateway configured, `GET`/`PUT /api/instance/settings/ai-models`,
`GET /api/instance/ai-models/catalog` and `GET /api/instance/ai-models/agents`
are instance-admin only. Non-admin board users and agents cannot change agent
adapters, models or AI connections (hires are forced to the managed defaults;
AI connection mutations return 403 `ai_models_managed`).
`GET`/`PUT /api/instance/settings/connectors` are instance-admin only; in SaaS
mode non-admins connect only allowed Apps connectors (403
`connector_not_allowed`). Project files: `GET
/api/companies/{companyId}/projects/{projectId}/files` for anyone with company
access (agents included); `POST` and `DELETE .../files/{fileId}` for board
members who are not viewers.

Policy: Default `agency-core` team installed only by onboarding (Director is the sole
recurring task); optional Agency Studio package is never automatic. No other scheduled jobs,
credentials, owner approval or publication authority. Creative ideas are documents
for owner selection, with production handoff through ordinary tasks.

Evidence: `source-only` — [team package](../../packages/teams-catalog/catalog/optional/content/agency-studio/TEAM.md)
and shipped catalog validation/tests.

Verification: `not-run` — actual import and agent-generated shortlist remain unverified.

Gaps: No new publishing capability is supplied by agent instructions.

## `content`

Capability ID: `agency/content`.

Review: `baseline`.

API: `present` — `GET /api/companies/{companyId}/content-items`,
`POST /api/companies/{companyId}/content-items`,
`GET /api/companies/{companyId}/content-items/{contentId}`,
`GET /api/companies/{companyId}/content-items/{contentId}/revisions`,
`GET /api/companies/{companyId}/content-items/{contentId}/revisions/{revisionNumber}`,
`POST /api/companies/{companyId}/content-items/{contentId}/revisions`,
`POST /api/companies/{companyId}/content-items/{contentId}/submit`, and
`POST /api/companies/{companyId}/content-items/{contentId}/tasks`.

Agent access: `partial` — authorized REST or generic native API access where
enabled. Assigned production agents may revise/submit; owner-only create/link.
Normal task creation uses existing issue APIs and their execution gates.

Policy: Company, campaign and every retained task/asset source must be readable;
agents must currently own an open linked task and pass issue mutation policy to
write. Source deletion/access revocation does not widen historical access.
Expected revision guards every mutation. No publication authority is granted.

Evidence: `source-only` — [routes](../../server/src/routes/agency-content.ts),
[access](../../server/src/services/agency-content-access.ts), and real DB/API tests.

Verification: `not-run` — actual bearer-agent/native execution has not been run;
the integration suite injects authenticated actors against disposable PostgreSQL.

Gaps: Dedicated native content tools, live agent execution, provider publishing,
source recovery administration and portability are outside this slice.

## `owner-review`

Capability ID: `agency/owner-review`.

Review: `baseline`.

API: `present` — `POST /api/companies/{companyId}/content-items/{contentId}/decisions`.

Agent access: `operator-only` — agents submit the current revision for review and
observe authorized content status; they cannot select ideas or approve/reject.

Policy: Active human company owner, rechecked under membership/content locks, or
trusted local implicit board. Owner status does not bypass private source access.
Approval binds the exact revision and current context; client/brand edits and
campaign binding/brief/archive changes invalidate it. Only a fresh revision can
address a request for changes. Idea selection is separate from final approval.

Evidence: `source-only` — [content service](../../server/src/services/agency-content.ts)
and owner/concurrency/context regression tests.

Verification: `not-run` — real-person browser and real-agent journeys are unverified.

Gaps: This is content review, not provider dispatch authorization or task completion.

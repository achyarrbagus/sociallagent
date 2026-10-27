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

Onboarding route: `POST /api/companies/{companyId}/onboarding/agency-team` and
`POST /api/companies/{companyId}/onboarding-seed` install the default `agency-core`
team under the Agency Director. Board only, requires `agents:create`; agents are
denied. Idempotent; failures are logged as `company.agency_core_team_install_failed`.

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

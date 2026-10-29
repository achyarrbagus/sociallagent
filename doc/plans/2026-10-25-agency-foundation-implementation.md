# Agency Foundation Implementation Plan

**Goal:** Deliver the first agency slice: owner-managed clients and brands, reusable brand context, and explicit project-to-brand campaign links in the existing app.

**Architecture:** Keep companies as agencies and projects as campaigns. Add company-scoped client/brand records and nullable project brand references, preserving existing project/task behavior. Use existing auth, audit, database migrations, React Query, and UI components.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, Express, Zod, React, shadcn, Vitest.

**Spec:** [Agency PRD](2026-10-25-prd-rewrite-creative-agency.md), primarily FR-01, FR-02 and FR-04. Subsequent content approval and provider publishing slices remain separate deliverables; this slice must not imply they exist.

## Global Constraints

- Company is agency; owner is a human user; client approval is not required.
- Keep legacy projects valid without a brand; no inferred backfill.
- All foreign references must belong to the same company.
- Client/brand writes require an active owner (local implicit board remains full-control operator).
- Brand records are company-readable in this foundation; do not claim brand ACL enforcement.
- No secrets in brand profiles. Archive instead of deleting historical records.
- UI uses existing components and token values; footer cancel left, save right.
- Work on feature branch in the existing shared workspace; preserve the untracked PRD.

## Review Focus

1. Foreign-company client or brand IDs must fail without disclosure or persistence.
2. Viewer/operator/agent identity must not acquire owner-only client/brand writes.
3. Archived parents must not accept new brands/campaign links; retain existing history.
4. Switching companies while a form is open must never save its data to the new company.
5. Existing projects, private-project authorization, and company deletion must continue to work.

## Task 1: Contracts, persistence and owner-managed API

Files: new `packages/db/src/schema/agency_clients.ts`, `agency_brands.ts`; shared `types/agency.ts`, `validators/agency.ts`; new server `services/agency.ts`, `routes/agency.ts`; exports, app registration and generated migration.

Interfaces: `AgencyClient` (name, contact name/email, description, archivedAt); `AgencyBrand` (clientId, name, websiteUrl, audience, toneOfVoice, brief, timezone, archivedAt). `GET/POST /companies/:companyId/agency/clients`, `PATCH /companies/:companyId/agency/clients/:id`; equivalent brand endpoints. GET returns `{ clients, brands, canManage }` from `/companies/:companyId/agency`.

- [x] Write validation and real database/API tests for owner CRUD, isolation, archive and audit; run failing tests.
- [x] Implement contracts, schema, service, routes and migration; enforce relational company scope in database and service.
- [x] Run focused tests and shared/db/server checks; inspect migration retention.

## Task 2: Campaign brand association

Files: `projects.ts` schema, shared project type/validator, project service, campaign linking UI.

Interface: optional nullable `brandId` on create/update and project responses. Service validates same-company active brand/client before accepting new bindings. Preserve existing binding when updating unrelated fields, including archived brands.

- [x] Write regression tests for cross-company binding, archived targets, null clearing, and legacy unbranded projects; run failing tests.
- [x] Add the nullable relation and service validation inside project mutation transactions.
- [x] Run focused regression and contract checks.

## Task 3: Usable agency directory

Files: `ui/src/api/agency.ts`, `ui/src/pages/Agency.tsx`, focused form/components under `ui/src/components/agency/`, `ui/src/App.tsx`, both sidebar variants, query keys.

Interface: `/agency` page provides client/brand create/edit/archive, brand context fields, and association of authorized existing projects with brands. Render mutation controls only when `canManage`; show errors, loading and empty states. Reset form identity on company changes.

- [x] Reuse existing layout/components and tokens; no design-system replacement.
- [x] Add behavior tests for client/brand form submissions, company-switch reset and server errors.
- [x] Implement navigation and directory with query invalidation after writes.
- [x] Run UI tests, UI typecheck and token gates.

## Task 4: Documentation and final verification

- [x] Add additive PRODUCT/SPEC/DB documentation describing shipped scope and approval boundary; update maps.
- [x] Run map checks, migration checks, token gates and targeted tests.
- [x] Attempt required full `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`; record unavailable prerequisites and failures precisely.
- [x] Obtain a fresh code review, address material findings, and report actual shipped behavior and remaining PRD slices.

## Progress and decisions

- Initial: implementation authorized by user; continue without another plan approval checkpoint.
- UI design helper: 12ui CLI available but hosted generation requires sign-in. Use established app components/tokens for this functional directory; no new visual direction is needed.
- Tooling: enable pinned pnpm through Corepack and install frozen lockfile before tests.


## Verification record

- 2026-10-25: 78 focused tests passed across shared input validation, real PostgreSQL agency/API and project regression tests, OpenAPI coverage, directory UI and sidebar navigation. The earlier sidebar-order assertion was updated for the new destination and the combined suite rerun green.
- Agency Studio catalog validation passed; 11 catalog tests passed for the six shipped teams.
- Shared and DB typechecks passed during the recursive check; direct server `tsc --noEmit` and final UI typecheck passed. UI production build passed with existing CSS/chunk warnings.
- Token gates, map checks, migration numbering/safety and five-snapshot retention checks passed.
- Independent review found two archive-edit regressions. Both were reproduced red and fixed: unchanged client/brand bindings can be resubmitted while editing historical records; genuinely new bindings still require active parents. Added malformed-identifier regression and 400 validation.
- Full recursive typecheck and native Runner build cannot finish because Cargo is absent (`cargo: command not found`). Full build also exposed API-reference-derived inventory drift during documentation integration; optional enrichment edits were removed, and both capability contract/inventory checks now pass. Agency API discovery uses OpenAPI directly.
- The repo-wide Vitest attempt was stopped during its first general-server group to release local resource contention. No repo-wide green-suite claim is made. Browser journeys, real agent execution/import and live publishing were not run.
- Ruling: work in a feature branch in the existing workspace, preserving the initial PRD; no commits, PR, deployment, live company mutation or provider action was performed.
- Ruling: extend the existing component/token system after the optional design generator required external sign-in; no new visual system was introduced.
- Scope delivered: agency foundation plus optional nine-agent team, including the requested Creative Strategist insight role. Revision-bound content approval, content calendar, brand ACLs and automated provider publishing remain subsequent PRD slices.

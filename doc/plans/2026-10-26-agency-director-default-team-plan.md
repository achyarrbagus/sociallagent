# Agency Director Default Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new company starts as a creative agency led by an "Agency Director" (internal role `ceo`) with an 11-agent specialist team installed beneath it, and the owner never sees the word "CEO".

**Architecture:** A new bundled catalog team `agency-core` contains the Director as its manager plus 11 specialists and a recurring Director review task. The portability importer gains an "adopt agents" option so the onboarding-created Director fills the package's manager slot instead of a second Director being created. A small server service `ensureAgencyCoreTeam` installs the team idempotently from both onboarding paths (wizard via a new route, seed route directly). Copy, persona assets and the `ceo` role label change to "Agency Director"; the `ceo` enum value and all authorization checks stay untouched.

**Tech Stack:** TypeScript, Express, Drizzle, React + Vite, Vitest, `@paperclipai/teams-catalog` (agentcompanies/v1 markdown packages).

**Spec:** `doc/plans/2026-10-26-agency-director-default-team-design.md`

## Global Constraints

- Role enum value stays `ceo`; no new role, no DB migration, no change to any `role === "ceo"` / `role !== "ceo"` authorization check.
- Owner-visible text never says "CEO": names, titles, role labels, org chart, onboarding, catalog, hire dialog, owner-visible error messages, agent instructions.
- Only the human owner approves final content; no agent instruction may claim approval authority.
- Onboarding must still complete with a usable Director when team install fails; the failure is shown to the owner and written to the activity log.
- Only the Director has a recurring task; specialists wake only on assignment.
- `core-exec-team` stays in the catalog with `defaultInstall: false`; `agency-studio` stays unchanged as an optional team.
- Existing companies/agents are not migrated.
- Opening question option ids `interview` and `task` and `freeText: true` on `task` are fixed.
- UI changes pass `pnpm check:token-gates`.
- Plan/doc files live in `doc/plans/`; commit only with owner's go-ahead on this branch (`feat/creative-agency-foundation`).

## Review Focus

- Owner renames the Director in the wizard (e.g. "Rina") → team still installs under that agent; specialists' `reportsTo` and the recurring task assignee resolve to it (Task 2 + Task 5 tests use a non-default name).
- Wizard retried/restored after the team already installed → second call returns `already_installed`, no duplicate agents (Task 5).
- Company already has an older `ceo` agent (existing companies like `amifish`) and owner installs `agency-core` from the catalog without adopt → warning "two leaders", install not blocked (Task 3).
- Adopt target from another company, terminated, or not role `ceo` → 422, nothing written (Task 3).
- Hire needed approval and approval is still pending when the install route is called → 409 with a clear message, not a half-installed team (Task 5).

---

### Task 1: Shared role label

**Files:**
- Modify: `packages/shared/src/constants.ts:63-64`
- Test: `packages/shared/src/constants.test.ts` (create if absent)

**Interfaces:**
- Produces: `AGENT_ROLE_LABELS.ceo === "Agency Director"`.

- [ ] **Step 1: Write failing test** `it("labels the ceo role as Agency Director")` → `expect(AGENT_ROLE_LABELS.ceo).toBe("Agency Director")`.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/shared/src/constants.test.ts` → FAIL (`"CEO"`).
- [ ] **Step 3: Change** `ceo: "CEO"` → `ceo: "Agency Director"`.
- [ ] **Step 4: Run** the test → PASS; then `pnpm exec vitest run packages/shared ui/src/lib server/src/__tests__ -t "CEO"` and update any assertion that expected the old label string.
- [ ] **Step 5: Commit** `feat(shared): label ceo role as Agency Director`.

### Task 2: Portability importer — adopt existing agents

**Files:**
- Modify: `server/src/services/company-portability.ts:760-764` (`ImportBehaviorOptions`), the preview builder (`buildPreview`, ~3880) and the agent-creation loop in `importBundle` (~5549-5830)
- Test: `server/src/__tests__/company-portability-adopt-agents.test.ts` (create; copy fixture setup from `company-portability.test.ts`)

**Interfaces:**
- Produces: `ImportBehaviorOptions.adoptAgents?: Record<string /* manifest agent slug */, string /* existing agent id */>`.
  Semantics: an adopted slug is never created, renamed, replaced or counted as a collision; `importedSlugToAgentId` is seeded with `slug → existingId` before reporting links and task assignees resolve; the adopted agent's own fields (name, instructions, adapter, reportsTo) are not modified. Unknown id or id from another company → preview error `Adopted agent <slug> (<id>) is not present in the target company.`

- [ ] **Step 1: Write failing tests**
  - `adopts the manager slot`: package with `director` (manager) + `writer` (reportsTo director) + task `review` (assignee director); target company has existing agent "Rina" (id R). `importBundle(..., { adoptAgents: { director: R } })` → company agent count +1 (only writer), `writer.reportsTo === R`, task `review.assigneeAgentId === R`, Rina's name/instructions unchanged.
  - `rejects foreign adopt target`: adopt id from another company → preview `errors` contains `Adopted agent director`; no agents created.
- [ ] **Step 2: Run** `pnpm exec vitest run server/src/__tests__/company-portability-adopt-agents.test.ts` → FAIL.
- [ ] **Step 3: Implement** — filter adopted slugs out of the agent plan before collision handling; seed the slug map; validate ids against `preImportExistingAgentIds` (and in preview against the company's agents).
- [ ] **Step 4: Run** the new test plus `company-portability.test.ts` and `company-portability-import-batching.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(portability): adopt existing agents into package slots`.

### Task 3: Teams catalog — `adoptManagerAgentId` and two-leader warning

**Files:**
- Modify: `server/src/services/teams-catalog.ts:54-66` (options), `prepareCatalogTeamSource` (~769), `previewCatalogTeamImport` (~841), `installCatalogTeam` (~902)
- Modify: `packages/shared/src/validators/` catalog install/preview schemas (`catalogTeamInstallSchema`, `catalogTeamPreviewSchema`) to accept `adoptManagerAgentId: z.string().uuid().optional()`
- Test: `server/src/__tests__/teams-catalog-service.test.ts`

**Interfaces:**
- Consumes: `adoptAgents` (Task 2).
- Produces: `CatalogTeamImportOptions.adoptManagerAgentId?: string | null`. When set: agent must belong to `companyId`, not be terminated/terminating, and have `role === "ceo"`, else `unprocessable("Adopted manager must be an active Agency Director in this company.")`; mutually exclusive with `targetManagerAgentId`/`targetManagerSlug` (422). The team's manager slug is `team.rootAgentSlugs[0]`; pass `adoptAgents: { [managerSlug]: id }` to preview and import; drop the manager slug from `adapterOverrides` defaults.
- Produces: warning string `This team adds another Agency Director; the company already has one (<name>).` when the team's manager agent declares `role: ceo`, no adopt option is given, and the company has a non-terminated `ceo` agent.

- [ ] **Step 1: Write failing tests** — `installs under adopted manager` (no new ceo agent created; three heads report to adopted id), `rejects adopt of non-ceo agent` (422), `rejects adopt combined with targetManagerAgentId` (422), `warns about a second Agency Director` (install core-exec-team into a company that has a ceo → `warnings` contains `adds another Agency Director`, install succeeds).
- [ ] **Step 2: Run** `pnpm exec vitest run server/src/__tests__/teams-catalog-service.test.ts` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `teams-catalog-service.test.ts`, `teams-catalog-routes.test.ts`, `teams-catalog-install-no-overrides.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(teams-catalog): adopt existing manager and warn on second director`.

### Task 4: `agency-core` bundled team package

**Files:**
- Create: `packages/teams-catalog/catalog/bundled/company-defaults/agency-core/TEAM.md`, `README.md`, `LICENSE` (copy from agency-studio)
- Create: `.../agency-core/agents/<slug>/AGENTS.md` for slugs: `agency-director`, `account-manager`, `publishing-coordinator`, `performance-analyst`, `creative-strategist`, `content-strategist`, `seo-specialist`, `marketing-strategist`, `creative-director`, `copywriter`, `scriptwriter`, `designer`
- Create: `.../agency-core/projects/agency-operations/PROJECT.md`, `.../projects/agency-operations/tasks/director-review/TASK.md`
- Modify: `packages/teams-catalog/catalog/bundled/company-defaults/core-exec-team/TEAM.md` (`defaultInstall: false`)
- Regenerate: `packages/teams-catalog/generated/catalog.json`
- Test: `packages/teams-catalog/src/shipped-catalog.test.ts`

**Interfaces:**
- Produces: catalog key `paperclipai/bundled/company-defaults/agency-core`, slug `agency-core`, `manager: agents/agency-director/AGENTS.md`, `defaultInstall: true`, `recommendedForCompanyTypes: [agency, marketing, content]`.
- Agent frontmatter (name / title / role / reportsTo):

  | slug | name & title | role | reportsTo |
  |---|---|---|---|
  | agency-director | Agency Director | ceo | null |
  | account-manager | Account Manager | pm | agency-director |
  | publishing-coordinator | Publishing Coordinator | general | account-manager |
  | performance-analyst | Performance Analyst | researcher | account-manager |
  | creative-strategist | Creative Strategist | general | agency-director |
  | content-strategist | Content Strategist | general | creative-strategist |
  | seo-specialist | SEO Specialist | researcher | creative-strategist |
  | marketing-strategist | Marketing Strategist | cmo | creative-strategist |
  | creative-director | Creative Director | designer | agency-director |
  | copywriter | Copywriter | general | creative-director |
  | scriptwriter | Scriptwriter | general | creative-director |
  | designer | Creative Designer | designer | creative-director |

- Body: specialists reuse the matching agency-studio `AGENTS.md` body (operating contract + agency content API handoff) with reporting lines updated. New bodies: Director (sets priorities across brands, delegates to the three heads, reports to the owner; never approves final content), Creative Strategist adds "lead the strategy group", Creative Director (owns execution quality and brand consistency before submission; never approves), Scriptwriter (short-video scripts for reels/TikTok/shorts with hook, beats, on-screen text, CTA). No body contains "CEO".
- `director-review` task: `assignee: agency-director`, `project: agency-operations`, `recurring: true`, body: review priorities across brands, list content waiting for the owner's decision, assign the next useful task.

- [ ] **Step 1: Write failing test** in `shipped-catalog.test.ts`: `agency-core` exists, `defaultInstall === true`, 12 `agentSlugs`, `rootAgentSlugs` equals `["agency-director"]`, reporting map equals the table above, `core-exec-team.defaultInstall === false`, no file text in agency-core matches `/\bCEO\b/`.
- [ ] **Step 2: Run** `pnpm --filter @paperclipai/teams-catalog test` → FAIL.
- [ ] **Step 3: Write the package files** per Interfaces.
- [ ] **Step 4: Run** `pnpm --filter @paperclipai/teams-catalog build:manifest && pnpm --filter @paperclipai/teams-catalog validate && pnpm --filter @paperclipai/teams-catalog test` → PASS; update any existing expectations that assumed core-exec-team is the only `defaultInstall` team (also `ui/src/pages/TeamCatalog.fixtures.ts` if tests depend on it).
- [ ] **Step 5: Commit** `feat(teams-catalog): add agency-core default team`.

### Task 5: `ensureAgencyCoreTeam` service and onboarding route

**Files:**
- Create: `server/src/services/agency-core-team.ts`
- Modify: `server/src/routes/onboarding-seed.ts` (add route, call service after seed apply commits)
- Modify: `packages/shared/src/validators/` (new `ensureAgencyTeamSchema = z.object({ agentId: z.string().uuid() })`) and API path constant if the repo keeps one for onboarding routes
- Create: `ui/src/api/onboarding-agency-team.ts`
- Test: `server/src/__tests__/agency-core-team.test.ts`, `server/src/__tests__/onboarding-seed-route.test.ts`

**Interfaces:**
- Consumes: `installCatalogTeam(companyId, "paperclipai/bundled/company-defaults/agency-core", { adoptManagerAgentId, adapterOverrides, actor })` (Task 3), `listInstalledCatalogTeams`.
- Produces:
  ```ts
  export type EnsureAgencyCoreTeamResult =
    | { status: "installed"; agentIds: string[]; warnings: string[] }
    | { status: "already_installed" }
    | { status: "failed"; error: string };
  export function agencyCoreTeamService(db: Db): {
    ensureInstalled(companyId: string, directorAgentId: string, actor: CatalogTeamActorContext): Promise<EnsureAgencyCoreTeamResult>;
  };
  ```
  - `already_installed` when `listInstalledCatalogTeams(companyId)` contains `agency-core`.
  - Director not found / other company / not `ceo` → throws 422; Director has pending hire approval → throws 409 `Agency Director is waiting for approval.`.
  - `adapterOverrides`: every specialist slug gets `{ adapterType: director.adapterType, runner: director.runner (if set), adapterConfig: { model } }` where `model` is copied only when the Director's `adapterConfig.model` is a string. No other config keys are copied.
  - Any install error is caught → activity log `company.agency_core_team_install_failed` with `{ directorAgentId, error }` → returns `failed`.
- Route: `POST /api/companies/:companyId/onboarding/agency-team`, body `{ agentId }`, board actor only (403 otherwise), `assertCompanyAccess`; 200 with the result for all three statuses.
- Seed route: after the seed transaction commits and returns an agent id, call `ensureInstalled` and include `agencyTeam: EnsureAgencyCoreTeamResult` in the response.
- UI client: `ensureAgencyTeam(companyId: string, agentId: string): Promise<EnsureAgencyCoreTeamResult>`.

- [ ] **Step 1: Write failing tests** — service: `installs 11 specialists under a renamed director` (Director named "Rina"; 11 new agents; heads report to Rina; `director-review` task assigned to Rina), `is idempotent` (second call → `already_installed`, agent count unchanged), `returns failed and logs activity when install throws` (stub install to throw), `rejects pending-approval director` (409); route: agent actor → 403, other company → 403/404; seed route: response has `agencyTeam.status === "installed"`.
- [ ] **Step 2: Run** `pnpm exec vitest run server/src/__tests__/agency-core-team.test.ts server/src/__tests__/onboarding-seed-route.test.ts` → FAIL.
- [ ] **Step 3: Implement** service, route, validator, UI client.
- [ ] **Step 4: Run** the same command plus `server/src/__tests__/openapi-routes.test.ts` (register the route in `server/src/routes/openapi.ts` if that test requires it) → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): install agency-core team under the Agency Director`.

### Task 6: Onboarding assets and seed defaults

**Files:**
- Create: `server/src/onboarding-assets/first-task/agency-director/AGENTS.md`
- Delete: `server/src/onboarding-assets/first-task/chief-of-staff/AGENTS.md`
- Modify: `server/src/onboarding-assets/first-task/{greeting.md,opening-question.json,brief.md,skills/first-task/SKILL.md,README.md}`
- Modify: `server/src/onboarding-assets/ceo/{AGENTS.md,HEARTBEAT.md,SOUL.md,TOOLS.md}`, `server/src/services/default-agent-instructions.ts`
- Modify: `server/src/services/onboarding-first-task-assets.ts:132-150` (rename `renderChiefOfStaffPersona` → `renderAgencyDirectorPersona`, load `agency-director/AGENTS.md`), `server/src/routes/agents.ts:2480-2497` comment
- Modify: `server/src/services/onboarding-seed.ts:186-205` (title defaults to `"Agency Director"` when seed role is empty; created agent name defaults to `"Agency Director"`)
- Test: `server/src/services/onboarding-first-task-assets.test.ts`, `server/src/services/onboarding-greeting.test.ts`, `server/src/__tests__/issue-onboarding-first-task-routes.test.ts`, `onboarding-seed-route.test.ts`

**Interfaces:**
- Produces: `renderAgencyDirectorPersona(placeholders: OnboardingFirstTaskPlaceholders): Promise<string>`; `buildOnboardingFirstAgentInstructionsBundle` unchanged signature.
- Persona: the agent leads a creative agency for the owner, already has its team (Account Manager, Creative Strategist, Creative Director and their reports), delegates rather than doing specialist work, points the owner to **Clients & Brands** (`/agency`) for client/brand profiles, never approves final content.
- Opening question copy (English, ids fixed): `interview` → label "Interview me about the agency and our first client", description "I'll learn about your agency, your first client and brand, then plan the team's first work."; `task` → label "I already have a brief", freeText kept.
- `SKILL.md`: remove proposing/hiring a team from scratch; `interview` path collects agency profile + first client/brand + campaign goal, asks the owner to add them in Clients & Brands, then creates the first delegated tasks to the three heads; `task` path delegates the brief immediately.
- No asset contains `CEO`, `chief of staff` or `Chief of staff`.

- [ ] **Step 1: Write failing tests** — persona bundle contains "Agency Director" and not /CEO|chief of staff/i; opening question still validates (ids + freeText) and its interview label equals the copy above; seed with empty role → agent title `"Agency Director"`; grep-style test over every file in `server/src/onboarding-assets/` → no `/\bCEO\b|chief of staff/i`.
- [ ] **Step 2: Run** `pnpm exec vitest run server/src/services/onboarding-first-task-assets.test.ts server/src/services/onboarding-greeting.test.ts server/src/__tests__/issue-onboarding-first-task-routes.test.ts server/src/__tests__/onboarding-seed-route.test.ts` → FAIL.
- [ ] **Step 3: Rewrite assets and loader** per Interfaces.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): Agency Director persona and first-task copy`.

### Task 7: Onboarding wizard

**Files:**
- Modify: `ui/src/lib/onboarding-agent-role.ts:17-19` (`DEFAULT_AGENT_ROLE = "ceo"`, `DEFAULT_AGENT_NAME = "Agency Director"`; keep "Chief of staff" in `WIZARD_SUPPLIED_NAMES` so restored runs get replaced)
- Modify: `ui/src/components/OnboardingWizard.tsx` (~598-612 role state, remove first-agent role picker, ~3002 placeholder → `e.g. Agency Director`, ~2557-2580 call `ensureAgencyTeam` after hire + approval; comments mentioning chief-of-staff)
- Test: `ui/src/lib/onboarding-agent-role.test.ts`, `ui/src/components/OnboardingWizard.test.tsx`

**Interfaces:**
- Consumes: `ensureAgencyTeam` (Task 5).
- Behavior: after `hire` (and `approvalsApi.approve` when present) succeeds, call `ensureAgencyTeam(createdCompanyId, agent.id)`. `installed`/`already_installed` → invalidate `queryKeys.agents.list(createdCompanyId)` and continue to step 5. `failed` or thrown error → still continue to step 5, but show a non-blocking notice on the Review step: "Your Agency Director is ready, but the agency team could not be installed: <error>. You can install Agency Core from the Team Catalog." with a link to the Team Catalog.

- [ ] **Step 1: Write failing tests** — defaults are `ceo`/"Agency Director"; wizard submits hire with `role: "ceo"`; no role picker rendered for the first agent; `ensureAgencyTeam` called with the hired agent id after approval; failure path renders the notice text and still reaches the Review step.
- [ ] **Step 2: Run** `pnpm exec vitest run ui/src/lib/onboarding-agent-role.test.ts ui/src/components/OnboardingWizard.test.tsx` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** the same plus `OnboardingWizard.step.test.tsx OnboardingWizard.adapters.test.tsx OnboardingWizardVariant.test.tsx` and `pnpm check:token-gates` → PASS.
- [ ] **Step 5: Commit** `feat(ui): onboarding hires Agency Director and installs agency team`.

### Task 8: Remove remaining owner-visible "CEO"

**Files:**
- Modify (owner-visible strings only): `ui/src/components/ReportsToPicker.tsx`, `ApprovalPayload.tsx`, `ArtifactsPanel.tsx`, `OnboardingChat.tsx`, `ui/src/lib/agent-order.ts`, `ui/src/pages/{BoardChat,AgentDetail,AgentDetail.production,CompanyImport,CompanyExport,InviteUxLab}.tsx`, `ui/src/pages/secrets/proposal-review.tsx`, `ui/src/artifact-directions/frames/ThreadFrame.tsx`
- Modify: server error/messages that reach the UI — `rg -n '"[^"]*\bCEO\b' server/src/routes server/src/services` (e.g. "Only CEO can …") → "Only the Agency Director can …"
- Test: existing tests of the touched components/routes; add `ui/src/lib/no-ceo-copy.test.ts`

**Interfaces:**
- Produces: `no-ceo-copy.test.ts` reads every non-test `.ts/.tsx` under `ui/src` (excluding `*.test.*`, `*.stories.*`, `*fixtures*`), strips `//` and `/* */` comments, and fails on any remaining `/\bCEO\b/` inside a string literal or JSX text. Prefer `AGENT_ROLE_LABELS.ceo` over new literals.

- [ ] **Step 1: Write failing** `no-ceo-copy.test.ts`.
- [ ] **Step 2: Run** `pnpm exec vitest run ui/src/lib/no-ceo-copy.test.ts` → FAIL listing files.
- [ ] **Step 3: Replace** literals; update server messages and their test assertions.
- [ ] **Step 4: Run** `pnpm exec vitest run ui/src server/src/__tests__ -t "CEO|Agency Director"`, the new test, and `pnpm check:token-gates` → PASS.
- [ ] **Step 5: Commit** `feat(ui): show Agency Director instead of CEO`.

### Task 9: Docs, maps, full verification

**Files:**
- Modify: `doc/PRODUCT.md`, `doc/SPEC-implementation.md` (onboarding + default team), `maps/feature-map/onboarding.md`, `maps/feature-map/agency.md` (`team` sub-feature: agency-core installed by onboarding; agency-studio optional), `packages/teams-catalog/catalog/optional/content/agency-studio/README.md` (relation to agency-core), `server/src/onboarding-assets/first-task/README.md`
- Modify: `maps/agent-access-map/agency.md` (new onboarding route, board-only)

- [ ] **Step 1: Update docs** (additive; keep SPEC.md and SPEC-implementation.md aligned).
- [ ] **Step 2: Run** `node scripts/check-maps.mjs` → passes.
- [ ] **Step 3: Run** `pnpm -r typecheck && pnpm test:run && pnpm build` → all pass; record any failure verbatim.
- [ ] **Step 4: Manual check** on a throwaway instance (`PAPERCLIP_HOME=$(mktemp -d) pnpm dev`, never the owner's default data): run onboarding with name "Rina", confirm org chart has 12 agents in the design hierarchy, no "CEO" visible, assign a task to Rina and confirm she can assign a child task to Creative Strategist.
- [ ] **Step 5: Commit** `docs: agency director default team`.

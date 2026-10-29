# Agency content and owner review implementation

Spec: [agency PRD](2026-10-25-prd-rewrite-creative-agency.md), FR-05/06/07/15.
Goal: brand/campaign idea → owner selection → linked assigned production tasks → immutable content revisions → owner final review.

## Decisions and boundaries

- Extend the current feature branch/workspace; preserve all earlier agency changes.
- Content belongs to one brand and campaign. Require current campaign/brand consistency for writes; retain readable history when archived or detached.
- Only agency owners create/select/reject ideas, link production tasks and decide final reviews. Assigned, authorized production agents can add revisions and submit them. Non-owner humans are read-only for this slice.
- Use normal issue creation/assignment/wakeup APIs. Never duplicate checkout, run admission or task permission logic.
- Approval binds the current revision, caption/script/format/target-account fields and immutable attachment asset identities/digests. New revisions clear approval. Brand context changes invalidate pending/accepted review. This is content approval, not authorization to publish through a provider.
- Retain source issue IDs. Content reads/mutations must honor campaign and source-task access; deleted/revoked sources fail closed. Private source tasks cannot become company-readable through content previews.
- No auto-publication, provider account connection, calendar scheduling or client approval in this slice.
- Reuse established UI components/tokens. The optional design helper is unavailable without external sign-in, as established in the foundation slice.

## Tasks

1. [x] Write failing validation and real-DB/API tests for version history, owner-only decisions, stale-version conflicts, approval invalidation, cross-company/campaign/source access, archived parents and assets.
2. [x] Add shared contracts and schema: content items, immutable revisions, owner decisions, retained production-task links. Generate migration and retain five snapshots. Implement authorization-aware service and routes; register OpenAPI.
3. [x] Add content directory, draft/revision editor, revision history and owner review controls. Connect normal task creation/assignment and attachment selection; use idempotent backlog → link → todo preparation so tasks are linked before execution begins.
4. [x] Add UI behavior tests for owner actions, revision freshness and company changes. Add navigation/brand entry points. Update maps, PRODUCT/SPEC/DB docs and team instructions to the shipped API.
5. [x] Run focused tests, typechecks, migration checks, token gates and UI build; get an independent review and fix material findings. Attempt/report full repository checks with the known missing-Cargo prerequisite. Do not claim live agent/browser/provider execution without evidence.

## Review focus

- Two simultaneous decisions or revision writes must serialize; stale forms return 409.
- An agent cannot self-approve, select ideas, link itself to arbitrary content, or widen private task access.
- Asset references must be authorized, same-company task attachments with captured SHA-256; missing/changed assets cannot retain valid approval.
- Task completion alone never approves content; idea selection alone never approves a final revision.
- Brand edits/archives, campaign reassignment, task deletion/access revocation and company switching must not preserve unsafe approval or leak content.
- Existing project/company deletion must handle the new tables without breaking its ordering.


## Verification and review record

- Core lifecycle/authorization tests were written before the content modules; initial runs failed because the modules did not yet exist. Backend tests then passed against disposable PostgreSQL and generated migrations.
- Independent review identified private snapshot copying into broader tasks, task revival on preparation retries, loss of historical asset guards on deletion, and client-context freshness. Each was reproduced by failing tests and fixed. Follow-up review confirmed all addressed; campaign rebind/restore invalidation and sealed pagination were also checked.
- Final focused suite: 102 tests passed across 12 files, including existing agency/project regressions, content lifecycle, history, privacy, sealed pagination, concurrency, owner review, directory/company changes and status-version-guarded task preparation.
- Catalog validation and 11 shipped-catalog tests passed after updating the team's API instructions and regenerating its manifest.
- Direct server TypeScript, final UI typecheck, UI production build, shared and DB typechecks passed. UI build retains existing CSS/chunk-size warnings.
- Token gates, map structural checks, migration numbering/safety and five-snapshot retention passed. These are not live browser/agent execution evidence.
- Full recursive typecheck failed in the existing Runner Rust prerequisite: Cargo is not installed. Full repository build/suite disposition is recorded below after its attempt. No PR-ready or full-repository-green claim is made.

## Rulings

- Keep task creation and execution in existing APIs; use their idempotency and expectedStatusVersion promotion guard instead of adding an execution controller. No provider publishing is introduced.
- New tasks carry reference-only instructions, including generic titles. An explicit idempotency key distinguishes content/revision/role/agent; allowDuplicate is used only to avoid merging distinct reference-only tasks by their generic title.
- Missing retained task/asset sources fail closed, including for owners. This prevents history disclosure but requires preserving source records; source recovery administration remains a stated limitation.
- Current context covers client/brand versions and the campaign description. Rebinding or archiving a campaign invalidates approval in its existing project mutation transaction.
- Reuse the existing token/component design system; hosted design generation remains unavailable without external sign-in. Work continues in the existing feature branch; no deployment, live company mutation or provider action is authorized by this implementation alone.


## Full-check disposition

- `pnpm -r typecheck`: failed at Runner `typecheck:rust` because `cargo` is not installed. Shared/DB and direct server/UI checks passed separately.
- `pnpm build`: failed at Runner `build:binary` because `cargo` is not installed, after capability/protocol contract checks passed. UI production build passed separately.
- `pnpm test:run`: attempted, then interrupted (exit 130) during its general-server/chat integration group. There are no final complete-suite totals. The known Rust prerequisite prevents full repo qualification; targeted feature coverage is reported separately, not as a repo-wide pass.


## Company deletion interop

Content transactions, profile writes and campaign-context mutations take a shared
company-scoped transaction advisory lock before row locks. Company deletion takes
the exclusive counterpart before its existing child-first cleanup. This prevents
new parent-first content/source reads from inverting deletion locks. A real
PostgreSQL test verifies a content lease can finish before deletion removes source
rows and that normal deletion then succeeds. Its standalone fixture explicitly
seeds terminated agents, the existing deletion precondition; the first fixture
run failed because an asynchronous lifecycle worker was not running, then passed
after correcting that fixture. No agent termination policy was bypassed.

The later focused run includes 106 tests across 13 files (including the existing
assigned-backlog route contract). The earlier 105/106 run's sole fixture failure
is retained above; its corrected content integration file passed 9/9 separately,
and the final combined hand-off result is recorded after rerun.


Final hand-off: the corrected combined run passed **106/106 tests in 13 files**.
The independently run shipped-team catalog passed **11/11**. Latest direct server
TypeScript passed after the lifecycle barrier changes; UI typecheck/build, token
gates, map checks and migration checks passed. No full-repository-green claim:
Rust build/typecheck is blocked by missing Cargo and the full-suite attempt was
interrupted before final totals. No browser, real-agent, provider or deployment
execution is claimed.

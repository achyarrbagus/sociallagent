# Social Publishing — Plan 1: Foundation + Facebook Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand owner connects a Facebook Page with their own tokens; an agent proposes a multi-account schedule for approved content; the owner confirms it in the task thread; the server posts each slot at its time and records the post URL or a readable failure.

**Architecture:** Agency-specific tables (`agency_social_accounts`, `agency_publication_plans`) plus new columns on `agency_publications`. Tokens live as one JSON secret per account in the instance vault (`company_secrets`), bound to a `system` target, following `server/src/services/agent-observability.ts`. Confirmation reuses `request_confirmation` issue interactions with a server-owned `publicationPlan` sub-payload, following `server/src/services/secret-proposals.ts`. A delivery-work queue (template `server/src/services/browser-use-work.ts`) publishes due rows through per-platform adapters under `server/src/services/social-publishing/`. Plans 2–4 add X, Instagram and TikTok adapters on this foundation.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres (embedded Postgres in tests), Zod, Vitest + supertest, React (Vite) UI, Bun for scripts.

**Spec:** `doc/plans/2026-10-31-social-publishing-connectors-design.md`

## Global Constraints

- Run commands with Bun: `bun run typecheck`, `bun run test:run`, `bun run build`, `bun run db:generate`; single test files with `cd server && bunx vitest run <file>`.
- Every route is company-scoped: `assertCompanyAccess(req, companyId)` first; every mutation calls `logActivity`.
- Owner-only mutations use `isAgencyOwner(req.actor, companyId)` from `server/src/services/agency-access.js`; others get 403 "Agency owner access required".
- A token value never appears in an API response, activity details, log line, interaction payload, error message, or agent context. Responses expose only `credentialFieldsConfigured: string[]`.
- Nothing is posted unless (a) the content item is `approved` with `approvedRevisionNumber === row.revisionNumber`, and (b) the row came from an owner-confirmed plan. Re-check (a) immediately before the provider call.
- Text over a platform limit is rejected at proposal time with the limit in the message; never truncated.
- One platform's failure never changes another row of the same group.
- New tables get `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` in the migration (matches `0386_rls_lockdown.sql`).
- `dispatch: "agent"` is refused (422 "This brand has a connected {Platform} account. Schedule it through the connected account.") when the brand has an active social account for that platform.
- UI changes pass `bun run check:token-gates` (token-only styling per `DESIGN.md`).
- Facebook Graph API base: `https://graph.facebook.com/v23.0`, video uploads `https://graph-video.facebook.com/v23.0` (one constant `FACEBOOK_GRAPH_VERSION = "v23.0"`; confirm current version during live proof).

## Review Focus

1. **Server restart while a row is `publishing`.** Expect: if the final provider request was not yet sent, the row returns to `scheduled` and posts once; if it was sent, the row becomes `failed` with "Outcome unknown: check the Facebook Page before rescheduling." — never a second post. (Task 6 test `recovers a crashed claim without double posting`.)
2. **Content revised between confirmation and posting time.** Expect: scheduled connector rows are cancelled at revision time with a visible reason, and the worker also refuses if it races. (Task 7 tests.)
3. **Provider error text echoing credentials** (for example a Graph error that repeats the request URL with `access_token=`). Expect: the stored `failureReason` has every credential value and `access_token=...` query replaced by `[redacted]`. (Task 4 test `redacts tokens from provider errors`.)
4. **A non-owner board member accepting the confirmation card.** Expect: 403 and the interaction stays pending; the agent itself can never accept. (Task 5 test `only an agency owner can confirm a plan`.)
5. **Two app instances running the worker at once.** Expect: each row is claimed by exactly one (`UPDATE ... WHERE status='scheduled' RETURNING`). (Task 6 test `two concurrent sweeps claim a row once`.)

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/src/schema/agency_social_accounts.ts` (create) | Social account table |
| `packages/db/src/schema/agency_publication_plans.ts` (create) | Proposed/confirmed plans |
| `packages/db/src/schema/agency_publications.ts` (modify) | New columns, status/dispatch checks |
| `packages/db/src/schema/index.ts` (modify) | Export new tables |
| `packages/db/src/migrations/0387_*.sql` (generate + edit) | Migration with RLS |
| `packages/shared/src/validators/agency-social.ts` (create) | Zod schemas + DTO types for accounts and plans |
| `packages/shared/src/validators/agency-publications.ts` (modify) | New status/dispatch values and view fields |
| `packages/shared/src/validators/issue.ts` (modify) | `publicationPlan` sub-payload on `request_confirmation` |
| `server/src/services/social-publishing/types.ts` (create) | Adapter interface, media classification, rule checks |
| `server/src/services/social-publishing/redact.ts` (create) | Credential redaction for errors |
| `server/src/services/social-publishing/facebook.ts` (create) | Facebook Page adapter |
| `server/src/services/social-publishing/adapters.ts` (create) | Registry `socialAdapter(platform)` |
| `server/src/services/agency-social-accounts.ts` (create) | Connect/test/replace/remove, credential vault I/O |
| `server/src/services/agency-publication-plans.ts` (create) | Propose, confirm, reject, direct schedule |
| `server/src/services/social-publishing/worker.ts` (create) | Claim, publish, recover, next due time |
| `server/src/services/agency-publications.ts` (modify) | View fields, agent-dispatch refusal, stale cancel helper |
| `server/src/routes/agency-social.ts` (create) | Account + plan routes |
| `server/src/routes/issues.ts` (modify) | Server-owned payload guard, owner check, accept/reject hooks |
| `server/src/app.ts` (modify) | Mount routes, register worker |
| `server/src/services/delivery-work-notifications.ts` (modify) | `agencyPublications` queue |
| `server/src/routes/openapi.ts` (modify) | Document new routes |
| `ui/src/api/agency-social.ts` (create) | API client |
| `ui/src/components/agency/SocialAccountDialog.tsx` (create) | Connect / manage dialog opened from Connectors |
| `ui/src/pages/apps/Browse.tsx` (modify) | Social platform rows in the SocialAgent tab and Installed |
| `ui/src/components/agency/ContentSchedule.tsx` (modify) | Connected-account scheduling and per-row status |
| `packages/teams-catalog/.../publishing-coordinator/AGENTS.md` (modify) | How to propose a plan |
| `doc/agency-content.md` (modify) | Document the feature |

---

### Task 1: Schema, migration and shared validators

**Files:**
- Create: `packages/db/src/schema/agency_social_accounts.ts`, `packages/db/src/schema/agency_publication_plans.ts`, `packages/shared/src/validators/agency-social.ts`
- Modify: `packages/db/src/schema/agency_publications.ts`, `packages/db/src/schema/index.ts`, `packages/shared/src/validators/agency-publications.ts`, `packages/shared/src/validators/index.ts` (export), migration `0387_*`
- Test: `server/src/__tests__/agency-social-schema.integration.test.ts`

**Interfaces:**
- Produces (db):
  - `agencySocialAccounts`: `id uuid pk`, `companyId → companies cascade`, `brandId → agency_brands cascade`, `platform text` (check in `'facebook','instagram','x','tiktok'`), `displayName text not null`, `externalAccountId text not null`, `credentialsSecretId uuid null`, `status text default 'active'` (check `'active','needs_reconnect'`), `tokenExpiresAt timestamptz null`, `lastVerifiedAt timestamptz null`, `createdByUserId text`, `createdAt`, `updatedAt`. Unique index `agency_social_accounts_brand_platform_uq (company_id, brand_id, platform)`.
  - `agencyPublicationPlans`: `id`, `companyId`, `contentId → agency_content_items cascade`, `revisionNumber int`, `issueId uuid null`, `proposedByAgentId uuid null → agents set null`, `interactionId uuid null`, `slots jsonb $type<PublicationPlanSlot[]>`, `status text default 'pending'` (check `'pending','confirmed','rejected','superseded'`), `resolvedByUserId text null`, `rejectReason text null`, `createdAt`, `updatedAt`.
  - `agencyPublications` new columns: `groupId uuid null`, `planId uuid null`, `socialAccountId uuid null → agency_social_accounts set null`, `postText text null`, `providerPostId text null`, `checkpoint jsonb $type<Record<string, unknown>> null`, `claimedAt timestamptz null`. Status check adds `'publishing'`; dispatch check adds `'connector'`. Index `agency_publications_due_idx (status, dispatch, scheduled_at)`.
- Produces (shared, `agency-social.ts`):
  - `SOCIAL_CONNECTOR_PLATFORMS = ["facebook","instagram","x","tiktok"] as const`, `type SocialConnectorPlatform`.
  - `connectSocialAccountSchema = z.object({ platform: z.enum(SOCIAL_CONNECTOR_PLATFORMS), credentials: z.record(z.string().trim().min(1).max(4096)) }).strict()`.
  - `replaceSocialCredentialsSchema = z.object({ credentials: z.record(z.string().trim().min(1).max(4096)) }).strict()`.
  - `interface AgencySocialAccount { id; brandId; platform; displayName; externalAccountId; status: "active"|"needs_reconnect"; tokenExpiresAt: string|null; lastVerifiedAt: string|null; credentialFieldsConfigured: string[]; createdAt: string }`.
  - `publicationPlanSlotSchema = z.object({ socialAccountId: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }), text: z.string().max(10000).optional().nullable() }).strict()`; `type PublicationPlanSlot`.
  - `proposePublicationPlanSchema = z.object({ issueId: z.string().uuid(), contentId: z.string().uuid(), revisionNumber: z.number().int().positive(), slots: z.array(publicationPlanSlotSchema).min(1).max(8) }).strict()`.
  - `scheduleConnectedSchema = proposePublicationPlanSchema.omit({ issueId: true })` (owner direct).
  - `interface AgencyPublicationPlan { id; contentId; revisionNumber; status; slots: PublicationPlanSlot[]; interactionId: string|null; rejectReason: string|null; createdAt: string }`.
- Produces (shared, `agency-publications.ts`): `AGENCY_PUBLICATION_STATUSES` adds `"publishing"`; `AgencyPublication` gains `dispatch: "agent"|"manual"|"connector"`, `groupId: string|null`, `socialAccountId: string|null`, `socialAccountName: string|null`, `postText: string|null`.

- [ ] **Step 1: Write the failing test** `agency-social-schema.integration.test.ts` (embedded Postgres harness as in `agency-publications.integration.test.ts`):
  - `rejects a second account for the same brand and platform` — inserting two `agencySocialAccounts` rows with the same `(companyId, brandId, "facebook")` throws a unique violation.
  - `accepts publishing status and connector dispatch` — inserting an `agencyPublications` row with `status: "publishing", dispatch: "connector"` succeeds; `status: "posting"` throws a check violation.
  - `enables row level security on the new tables` — `select relrowsecurity from pg_class where relname in ('agency_social_accounts','agency_publication_plans')` returns `true` twice.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/__tests__/agency-social-schema.integration.test.ts` — expect FAIL (tables missing).
- [ ] **Step 3: Implement the schema files and exports**, then `bun run db:generate`; append `ALTER TABLE "agency_social_accounts" ENABLE ROW LEVEL SECURITY;` and the same for `agency_publication_plans` to the generated `0387_*.sql`. Add the shared validators and exports.
- [ ] **Step 4: Run** the test again and `bun run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): add social account and publication plan schema`.

### Task 2: Adapter contract, media rules and redaction

**Files:**
- Create: `server/src/services/social-publishing/types.ts`, `server/src/services/social-publishing/redact.ts`, `server/src/services/social-publishing/adapters.ts`
- Test: `server/src/services/social-publishing/types.test.ts`, `server/src/services/social-publishing/redact.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type MediaKind = "image" | "video";
  export type PostShape = "text" | "photo" | "carousel" | "video";
  export interface PublishMedia { assetId: string; kind: MediaKind; contentType: string; byteSize: number; filename: string | null;
    read(): Promise<Buffer>; signedUrl: string | null }
  export interface PlatformRules { maxTextLength: number; shapes: PostShape[]; carousel: { min: number; max: number; allowVideo: boolean } | null;
    maxImageBytes: number; maxVideoBytes: number; imageTypes: string[]; videoTypes: string[]; publicUrlShapes: PostShape[] }
  export interface VerifiedAccount { externalAccountId: string; displayName: string; tokenExpiresAt: Date | null }
  export interface PublishContext { text: string; shape: PostShape; media: PublishMedia[]; credentials: Record<string, string>;
    checkpoint: Record<string, unknown>; saveCheckpoint(next: Record<string, unknown>): Promise<void>; fetch: typeof fetch }
  export type PublishOutcome = { status: "published"; providerPostId: string; externalUrl: string }
    | { status: "failed"; reason: string };
  export interface SocialAdapter { platform: SocialConnectorPlatform; label: string; credentialFields: Array<{ key: string; label: string; help: string }>;
    rules: PlatformRules; verify(credentials: Record<string, string>, fetchImpl: typeof fetch): Promise<VerifiedAccount>;
    publish(context: PublishContext): Promise<PublishOutcome> }
  export function mediaKindOf(contentType: string | null): MediaKind | null
  export function postShapeOf(media: Array<{ kind: MediaKind }>): PostShape   // 0 → text, 1 image → photo, 1 video → video, ≥2 → carousel
  export function checkPostAgainstRules(label: string, rules: PlatformRules, post: { text: string; media: Array<{ kind: MediaKind; contentType: string; byteSize: number }> }, env: { publicBaseUrl: boolean }): string[]
  ```
  Messages (exact copy): `"{label} allows at most {n} characters; this text has {m}."`, `"{label} does not support {shape} posts."`, `"{label} carousels take {min}–{max} items."`, `"{label} carousels cannot include videos."`, `"{filename} is {type}, which {label} does not accept."`, `"{filename} is larger than {label}'s {limit} MB limit."`, `"{label} needs a public domain to fetch media. Set SOCIALAGENT_PUBLIC_URL."`.
- Produces (`redact.ts`): `export function redactSecrets(text: string, secrets: string[]): string` — replaces each non-empty secret (length ≥ 6) and any `access_token=[^&\s"]+` with `[redacted]`, and truncates to 500 chars.
- Produces (`adapters.ts`): `export function socialAdapter(platform: string): SocialAdapter | null` and `export function connectedPlatforms(): SocialConnectorPlatform[]` (Plan 1: only `facebook`; Task 4 registers it).

- [ ] **Step 1: Write failing tests:**
  - `postShapeOf` returns `"text"` for `[]`, `"photo"` for one image, `"video"` for one video, `"carousel"` for two images.
  - `checkPostAgainstRules` with `{maxTextLength: 10}` and text `"12345678901"` returns `["Test allows at most 10 characters; this text has 11."]`.
  - Carousel with a video under `allowVideo: false` returns the "cannot include videos" message; a `publicUrlShapes: ["photo"]` rule with `publicBaseUrl: false` returns the public-domain message.
  - `redactSecrets("bad token EAABsecret123 at https://x/?access_token=EAAB999&a=1", ["EAABsecret123"])` equals `"bad token [redacted] at https://x/?access_token=[redacted]&a=1"`.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/services/social-publishing` — expect FAIL.
- [ ] **Step 3: Implement** the three files (registry starts empty).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): add social publishing adapter contract`.

### Task 3: Social accounts service and routes

**Files:**
- Create: `server/src/services/agency-social-accounts.ts`, `server/src/routes/agency-social.ts`
- Modify: `server/src/app.ts` (mount next to `agencyPublicationRoutes`), `server/src/routes/openapi.ts`
- Test: `server/src/__tests__/agency-social-accounts.integration.test.ts`

**Interfaces:**
- Consumes: `socialAdapter` (Task 2), `secretService` (`create`, `rotate`, `remove`, `syncSecretRefsForTarget`, `resolveSecretValue`), schemas (Task 1).
- Produces:
  ```ts
  export function agencySocialAccountsService(db: Db, deps?: { fetch?: typeof fetch; adapters?: (p: string) => SocialAdapter | null }): {
    list(companyId: string, brandId: string): Promise<AgencySocialAccount[]>;
    connect(companyId: string, brandId: string, input: ConnectSocialAccount, userId: string | null): Promise<AgencySocialAccount>;
    test(companyId: string, accountId: string, userId: string | null): Promise<AgencySocialAccount>;
    replaceCredentials(companyId: string, accountId: string, credentials: Record<string, string>, userId: string | null): Promise<AgencySocialAccount>;
    remove(companyId: string, accountId: string, userId: string | null): Promise<void>;
    resolveCredentials(companyId: string, accountId: string): Promise<Record<string, string>>; // server-internal only
    getRow(companyId: string, accountId: string): Promise<typeof agencySocialAccounts.$inferSelect>;
  }
  ```
  - Secret: one `local_encrypted`/`paperclip_managed` secret per account, value `JSON.stringify({ schema: "paperclip.agency-social-credentials.v1", platform, credentials })`, bound with `syncSecretRefsForTarget(companyId, { targetType: "system", targetId: \`agency-social-account:${id}\` }, [{ secretId, configPath: "credentials", versionSelector: "latest", projectionClass: "unclassified" }], { replaceAll: true })`. Resolve with binding context `{ consumerType: "system", consumerId: \`agency-social-account:${id}\`, configPath: "credentials", actorType: "system", actorId: null }`.
  - `connect`: unknown/unsupported platform → 422 "{Platform} publishing is not available yet."; missing credential keys → 422 listing the missing labels; extra keys → 422; calls `adapter.verify` **before** writing anything; verify failure → 422 "{Label} rejected these credentials: {redacted provider message}"; existing account for brand+platform → 409 "This brand already has a connected {Label} account. Replace its credentials instead."
  - `test`: re-verifies; success sets `status: "active"`, `lastVerifiedAt`, `displayName`, `tokenExpiresAt`; failure sets `status: "needs_reconnect"` and returns 422.
  - `remove`: deletes the row, then `secrets.remove(secretId)`; scheduled connector rows for the account become `cancelled` with `failureReason: "Cancelled: the social account was removed."`.
  - Activity actions: `agency.social_account.connected|tested|credentials_replaced|removed`, details `{ accountId, platform, displayName }` only.
- Routes (all owner-only, under `/companies/:companyId/agency`): `GET /social-accounts` (all brands, each with `brandId` and `brandName`), `GET /brands/:brandId/social-accounts`, `POST /brands/:brandId/social-accounts` (201), `POST /social-accounts/:accountId/test`, `PUT /social-accounts/:accountId/credentials`, `DELETE /social-accounts/:accountId` (204). Brand must belong to the company (404 "Brand not found").

- [ ] **Step 1: Write failing tests** (fake adapter injected through `deps.adapters` whose `verify` returns `{ externalAccountId: "123", displayName: "Coffee Page", tokenExpiresAt: null }` or throws):
  - `connects an account and never returns the token` — response JSON string does not contain the token; `credentialFieldsConfigured` equals the adapter's keys; a `company_secrets` row exists; `activity_log.details` does not contain the token.
  - `rejects credentials the provider refuses and stores nothing` — 422, zero rows in `agency_social_accounts` and no new secret.
  - `refuses a second account for the same brand and platform` — 409 with the exact message.
  - `marks the account needs_reconnect when a test fails`.
  - `removing an account cancels its scheduled connector posts and deletes the secret`.
  - `non-owners get 403 and other companies get 403` (writer actor; owner of another company).
- [ ] **Step 2: Run** `cd server && bunx vitest run src/__tests__/agency-social-accounts.integration.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** service, routes, mounting, OpenAPI entries (mirror the existing `/agency/publications` entries in `openapi.ts`).
- [ ] **Step 4: Run** the test and `bunx vitest run src/__tests__/openapi*.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): connect brand social accounts with vaulted tokens`.

### Task 4: Facebook Page adapter

**Files:**
- Create: `server/src/services/social-publishing/facebook.ts`
- Modify: `server/src/services/social-publishing/adapters.ts` (register)
- Test: `server/src/services/social-publishing/facebook.test.ts`

**Interfaces:**
- Produces `facebookAdapter: SocialAdapter` with:
  - `credentialFields`: `pageId` ("Page ID", help: "Facebook Page → About → Page transparency, or Meta Business Suite → Settings."), `pageAccessToken` ("Page access token", help: "In your Meta developer app, generate a long-lived Page access token with pages_manage_posts and pages_read_engagement.").
  - `rules`: `maxTextLength: 63206`, `shapes: ["text","photo","carousel","video"]`, `carousel: { min: 2, max: 10, allowVideo: false }`, `maxImageBytes: 10 MB`, `maxVideoBytes: 1024 MB`, `imageTypes: ["image/jpeg","image/png","image/gif","image/webp"]`, `videoTypes: ["video/mp4","video/quicktime"]`, `publicUrlShapes: []`.
  - `verify`: `GET {graph}/{pageId}?fields=id,name&access_token=…` → `{ externalAccountId: id, displayName: name, tokenExpiresAt: null }`; a Graph `error` → throw `Error(error.message)`.
  - `publish` by shape, all with `access_token` as a form field (never in a logged URL):
    - text: `POST {graph}/{pageId}/feed` form `message`.
    - photo: `POST {graph}/{pageId}/photos` multipart `source`, `message`, `published=true` → `post_id`.
    - carousel: for each image `POST /{pageId}/photos` multipart `source`, `published=false` → `id`; save `checkpoint.mediaIds` after each; then set `checkpoint.finalSent = true` via `saveCheckpoint` **before** `POST /{pageId}/feed` with `message` and `attached_media[i]={"media_fbid":"<id>"}`.
    - video: set `checkpoint.finalSent = true`, then `POST {graph-video}/{pageId}/videos` multipart `source`, `description` → `id`.
    - For text/photo, set `checkpoint.finalSent = true` immediately before the single request.
    - Success: `providerPostId` = returned post id; `externalUrl = https://www.facebook.com/{providerPostId}` (for video `https://www.facebook.com/{pageId}/videos/{id}`).
    - Failure: `{ status: "failed", reason: "Facebook rejected the post: " + redactSecrets(error.message, Object.values(credentials)) }`; network error → `"Could not reach Facebook: …"` (redacted).
  - Carousel resume: when `checkpoint.mediaIds` already has n ids, upload only the remaining items.

- [ ] **Step 1: Write failing tests** with a recorded fake `fetch` (assert method, URL path, form fields; return canned Graph JSON):
  - `verifies a page token` → `{ externalAccountId: "111", displayName: "Coffee Page" }`; the request URL contains `fields=id,name`.
  - `posts text to the page feed` → POST `/v23.0/111/feed` with `message`; outcome URL `https://www.facebook.com/111_222`.
  - `posts a single photo with its caption` → multipart to `/111/photos` with `published=true`.
  - `posts a carousel as unpublished photos then one feed post` → two `/photos` calls with `published=false`, then `/feed` with `attached_media[0]` and `attached_media[1]`; `saveCheckpoint` called with `finalSent: true` before the feed call.
  - `resumes a carousel from its checkpoint` → with `checkpoint.mediaIds: ["m1"]`, only the second photo is uploaded.
  - `uploads video to graph-video` → host `graph-video.facebook.com`.
  - `redacts tokens from provider errors` → Graph error message containing the token and `access_token=…` yields a reason with `[redacted]` and no token.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/services/social-publishing/facebook.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** with `FormData`/`Blob` from the media `read()` buffers; register in `adapters.ts`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): add Facebook Page publishing adapter`.

### Task 5: Publication plans — propose, confirm, reject, direct schedule

**Files:**
- Create: `server/src/services/agency-publication-plans.ts`
- Modify: `server/src/routes/agency-social.ts` (plan routes), `server/src/routes/issues.ts` (guard + hooks), `packages/shared/src/validators/issue.ts` (`publicationPlan` sub-payload `{ version: 1, planId: uuid }` on request_confirmation payload, optional), `server/src/services/agency-publications.ts` (agent-dispatch refusal), `server/src/routes/openapi.ts`
- Test: `server/src/__tests__/agency-publication-plans.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas, Task 2 `checkPostAgainstRules`/`postShapeOf`/`mediaKindOf`, Task 3 `getRow`, `notifyDeliveryWork(tx, DELIVERY_QUEUES.agencyPublications)` (Task 6 adds the queue constant; add it here if Task 6 is not yet merged).
- Produces:
  ```ts
  export function agencyPublicationPlansService(db: Db, deps?: { publicBaseUrl?: string | null; now?: () => Date }): {
    propose(companyId: string, agent: { agentId: string; runId: string | null }, input: ProposePublicationPlan): Promise<AgencyPublicationPlan>;
    confirm(companyId: string, planId: string, userId: string): Promise<AgencyPublication[]>;
    reject(companyId: string, planId: string, userId: string, reason: string | null): Promise<AgencyPublicationPlan>;
    scheduleDirect(companyId: string, input: ScheduleConnected, userId: string): Promise<AgencyPublication[]>;
    validate(companyId: string, input: Omit<ProposePublicationPlan, "issueId">): Promise<ValidatedSlot[]>; // throws 422 with all messages joined by "\n"
  }
  ```
  - `validate` checks, collecting every message: content exists in company and is approved at `input.revisionNumber` (else 409 "Only the current approved revision can be scheduled."); each account belongs to the content's brand and is `active` (422 "{displayName} needs to be reconnected." / "That account belongs to another brand."); no account twice; `scheduledAt ≥ now + 60 s`; adapter exists; `checkPostAgainstRules(adapter.label, adapter.rules, { text: slot.text ?? snapshot.caption ?? "", media }, { publicBaseUrl: Boolean(deps.publicBaseUrl) })`.
  - `propose`: agent must be the assignee of `input.issueId`, which is in the company and not `done`/`cancelled` (403 "Only the assigned agent can propose a schedule for this task."). Inserts the plan and a `request_confirmation` interaction on that issue (`continuationPolicy: "wake_assignee"`, `requestedResolverPolicy`/`effectiveResolverPolicy: "human_only"`, `resolverPolicyProvenance: "explicit"`, `effectiveResolverPolicySource: "governed_action"`, `idempotencyKey: \`publication-plan:${plan.id}\``, `title: "Confirm post schedule"`, `acceptLabel: "Schedule"`, `rejectLabel: "Change it"`, `allowDeclineReason: true`, `payload.publicationPlan: { version: 1, planId }`). `prompt`: `Schedule "{content title}" on {n} account(s)?`. `detailsMarkdown`: one section per slot — `**{Platform} · {displayName}** — {date/time in brand timezone, e.g. "Fri 6 Nov 2026, 19:00 (Asia/Jakarta)"}` then the exact text as a block quote and `Media: {n} file(s) ({filenames})`.
  - `confirm` (in one transaction, plan row `for update`): plan `pending` (else 409 "This schedule was already {status}."); re-run `validate`; insert one `agency_publications` row per slot with `dispatch: "connector"`, `groupId = planId`, `planId`, `socialAccountId`, `platform`, `accountLabel = displayName`, `postText = slot.text ?? snapshot.caption ?? ""`, `snapshot` of the revision, brand `timezone`, `createdByUserId`; plan → `confirmed`; `notifyDeliveryWork`; activity `agency.publication_plan.confirmed`.
  - `reject`: plan → `rejected` with `rejectReason`; activity `agency.publication_plan.rejected`.
  - `scheduleDirect`: owner path = validate + insert plan with `status: "confirmed"`, no interaction, same row insertion as `confirm`.
  - `issues.ts`:
    - creation guard next to the `secretProposal` guard: client-supplied `payload.publicationPlan` → 400 "payload.publicationPlan is server-owned metadata and cannot be supplied when creating an interaction".
    - before accepting/rejecting an interaction whose payload has `publicationPlan`: `if (!isAgencyOwner(req.actor, issue.companyId)) throw forbidden("Only an agency owner can confirm a post schedule")`.
    - after an accepted `request_confirmation` with `publicationPlan.planId`: `await plans.confirm(...)`; on error, record `result.publicationPlan = { version: 1, status: "failed", errorMessage }` the same way `secretProposal` failures are recorded, so the agent wakes with the reason.
    - after a rejection: `plans.reject(companyId, planId, userId, reason)`.
  - Routes: `POST /companies/:companyId/agency/publication-plans` (agent actor only; 201), `POST /companies/:companyId/agency/publication-plans/validate` (agent or owner; returns `{ ok: true }` or 422), `POST /companies/:companyId/agency/publications/connected` (owner; `scheduleConnectedSchema`; 201 with rows).
  - `agency-publications.ts` `create`: refuse `dispatch: "agent"` when an `active` account exists for the content's brand and `input.platform`, with the Global Constraints message.

- [ ] **Step 1: Write failing tests:**
  - `an agent proposes a two-account plan and the owner confirms it` → plan pending, one interaction with `payload.publicationPlan.planId`; owner accept via `issueRoutes` creates two rows with the same `groupId`, `dispatch: "connector"`, `status: "scheduled"`.
  - `only an agency owner can confirm a plan` → a non-owner board member's accept returns 403 and the interaction stays `pending`.
  - `rejects a proposal whose text is too long for the platform` → 422 containing "allows at most".
  - `rejects a proposal for an unapproved revision` → 409.
  - `rejecting the card records the reason and creates no posts`.
  - `confirming a plan whose content changed fails and creates no posts` → revision bumped before accept → interaction result `publicationPlan.status: "failed"`, zero publication rows.
  - `the owner can schedule connected accounts directly` → `POST /publications/connected` returns two rows.
  - `agent dispatch is refused when the brand has a connected account`.
  - `clients cannot inject publicationPlan metadata` → 400.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/__tests__/agency-publication-plans.integration.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** service, routes, issue hooks, shared payload schema, OpenAPI.
- [ ] **Step 4: Run** the test plus `bunx vitest run src/__tests__/agency-publications.integration.test.ts src/__tests__/issue*interaction*.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): confirm multi-account post schedules in the task thread`.

### Task 6: Publishing worker

**Files:**
- Create: `server/src/services/social-publishing/worker.ts`
- Modify: `server/src/services/delivery-work-notifications.ts` (`agencyPublications: "agency-publications"`), `server/src/app.ts` (register after `registerBrowserUseCleanup`), `server/src/services/agency-publications.ts` (`toView` new fields)
- Test: `server/src/__tests__/agency-social-worker.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `resolveCredentials`/`getRow`, Task 2 registry, `assetService(db).getById`, `getStorageService().getObject`.
- Produces:
  ```ts
  export const PUBLISH_BATCH = 10;
  export const CLAIM_STALE_MS = 15 * 60_000;
  export function socialPublishingWorker(db: Db, deps?: { fetch?: typeof fetch; now?: () => Date; adapters?: (p: string) => SocialAdapter | null;
    storage?: StorageService; publicBaseUrl?: string | null }): {
    sweep(): Promise<{ published: number; failed: number; cancelled: number; requeued: number }>;
    nextSweepAt(): Promise<number | null>;   // min(scheduled connector scheduledAt, oldest publishing claimedAt + CLAIM_STALE_MS)
  }
  export function registerSocialPublishing(coordinator: ReturnType<typeof createDeliveryWorkCoordinator>,
    worker: ReturnType<typeof socialPublishingWorker>, canRun: () => boolean): void  // same shape as registerBrowserUseCleanup, retryMs 5000
  ```
  - Recovery first: rows `publishing` with `claimedAt < now − CLAIM_STALE_MS`: `checkpoint.finalSent !== true` → back to `scheduled` (`claimedAt: null`); otherwise `failed` with `"Outcome unknown: check the {Label} account before rescheduling."`.
  - Claim: select up to `PUBLISH_BATCH` ids `status='scheduled' and dispatch='connector' and scheduled_at <= now` ordered by `scheduled_at`; each claim is `update … set status='publishing', claimed_at=now where id=? and status='scheduled' returning *`; skip when nothing returned.
  - Per claimed row: approval not current → `cancelled` "Cancelled: the content changed after it was confirmed."; account missing → `failed` "The social account was removed."; account `needs_reconnect` → `failed` "{displayName} needs to be reconnected."; then resolve credentials, build `PublishMedia` from `snapshot.assets` (verify `sha256` of the read buffer equals the snapshot; mismatch → `failed` "An attached file changed after approval."), call `adapter.publish` with `saveCheckpoint` persisting `checkpoint` on the row.
  - Outcome `published` → `status: "published"`, `externalUrl`, `providerPostId`, `publishedAt`; `failed` → `status: "failed"`, `failureReason`. A thrown error → `failed` with `redactSecrets(String(error), credentialValues)`. Activity `agency.publication.published|failed` with `actorType: "system"`.
  - Each row is handled in its own try/catch; one row's error never stops the batch.

- [ ] **Step 1: Write failing tests** (fake adapter + in-memory storage):
  - `publishes a due row once and records the post URL`.
  - `does not touch rows that are not yet due`.
  - `cancels a due row whose approval is no longer current`.
  - `one failing account does not affect the other row in the group`.
  - `two concurrent sweeps claim a row once` → `Promise.all([sweep(), sweep()])`, adapter called once.
  - `recovers a crashed claim without double posting` → stale `publishing` row with `finalSent: false` goes back to `scheduled` and posts once; with `finalSent: true` becomes `failed` with the exact "Outcome unknown" text and the adapter is not called.
  - `fails when an attached file changed after approval` (sha mismatch).
  - `nextSweepAt returns the earliest due time`.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/__tests__/agency-social-worker.integration.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** worker, queue constant, registration in `app.ts`, `toView` fields (`groupId`, `socialAccountId`, `socialAccountName` via left join, `postText`).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): publish confirmed posts from the server`.

### Task 7: Cancel connector posts when approval lapses

**Files:**
- Modify: `server/src/services/agency-publications.ts` (export helper), `server/src/services/agency-content.ts` (call sites at the three `approvedRevisionNumber` updates), `server/src/services/agency-content-invalidation.ts` (call after both updates)
- Test: extend `server/src/__tests__/agency-publication-plans.integration.test.ts`

**Interfaces:**
- Produces: `export async function cancelStaleConnectorPublications(db: DbOrTx, companyId: string, contentIds?: string[]): Promise<number>` — sets `status: "cancelled"`, `failureReason: "Cancelled: the content changed after it was confirmed."` for `scheduled` connector rows whose content is not `approved` at `revisionNumber`; logs one `agency.publication.cancelled` activity per row with `details.reason: "approval_lapsed"`.

- [ ] **Step 1: Write failing tests:** `a new revision cancels confirmed connector posts`; `a brand context change cancels them`; `manual and agent rows are not touched`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** and call inside the same transaction as each approval-clearing update.
- [ ] **Step 4: Run** the plan tests and `agency-content.integration.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(agency): cancel connected posts when approval lapses`.

### Task 8: UI — Social connectors in Connectors and connected scheduling

**Files:**
- Create: `ui/src/api/agency-social.ts`, `ui/src/components/agency/SocialAccountDialog.tsx`, `ui/src/components/agency/SocialAccountDialog.test.tsx`
- Modify: `ui/src/pages/apps/Browse.tsx` (rows), `ui/src/pages/apps/Browse.test.tsx`, `ui/src/components/agency/ContentSchedule.tsx`, `server/src/routes/agency-social.ts` (`GET /companies/:companyId/agency/social-platforms` → `[{ platform, label, credentialFields }]` from the registry, any company member)

**Interfaces:**
- Consumes: routes from Tasks 3, 5; `AgencyPublication` view fields (Task 6).
- Produces: `agencySocialApi = { platforms(companyId), listAll(companyId), list(companyId, brandId), connect(companyId, brandId, body), test(companyId, id), replace(companyId, id, credentials), remove(companyId, id), scheduleConnected(companyId, body) }`.
- Behavior:
  - Connectors → **SocialAgent** tab shows one row per platform with an adapter (Plan 1: Facebook), using the existing catalog row layout, with "Connect". Search matches the platform name. The **Installed** tab lists each connected account (`displayName`, brand name, status badge "Connected"/"Needs reconnect", last verified time) with Test, Replace credentials and Remove (confirmation dialog) in its menu. Owner-only: non-owners see the rows without actions.
  - "Connect" opens `SocialAccountDialog` for one platform: a required brand select (active brands without an account for that platform), write-only password inputs per `credentialFields` with their `help` text, a link "How to create a developer app" per platform (Facebook: `https://developers.facebook.com/docs/pages-api/getting-started`), footer Cancel left / Connect right (DESIGN.md). Errors are shown inline; the form keeps entered values on error.
  - Platforms without an adapter are not offered.
  - ContentSchedule: when the brand has connected accounts, show checkboxes per account, an optional per-account text override (with live character count against `maxTextLength` returned by the platforms endpoint — add `maxTextLength` to that response), date/time in brand timezone, and a "Schedule" button calling `scheduleConnected`. Rows show `publishing` as "Posting…", `published` with "View post" link, `failed` with the reason, `cancelled` with the reason.

- [ ] **Step 1: Write failing tests** (Vitest + Testing Library, mock API): in `Browse.test.tsx` `lists Facebook in the SocialAgent tab and connected accounts in Installed`; in `SocialAccountDialog.test.tsx` `connect form requires a brand, never pre-fills a token and shows the provider error inline`, `remove asks for confirmation`.
- [ ] **Step 2: Run** `cd ui && bunx vitest run src/components/agency/SocialAccountDialog.test.tsx src/pages/apps/Browse.test.tsx` — expect FAIL (Browse has 5 known pre-existing assistant failures; only the new tests matter).
- [ ] **Step 3: Implement** components and wiring.
- [ ] **Step 4: Run** the tests, `bun run check:token-gates`, and `cd ui && bunx tsc --noEmit -p .` — expect PASS.
- [ ] **Step 5: Commit** `feat(agency-ui): connect social accounts and schedule to them`.

### Task 9: Agent instructions, docs and full verification

**Files:**
- Modify: `packages/teams-catalog/catalog/bundled/company-defaults/agency-core/agents/publishing-coordinator/AGENTS.md`, `doc/agency-content.md`, `doc/plans/2026-10-31-social-publishing-connectors-design.md` (status line: Plan 1 done)

- [ ] **Step 1:** Add to the Publishing Coordinator a "Connected-account publishing" section: list accounts with `GET /api/companies/{companyId}/agency/brands/{brandId}/social-accounts`; check a plan with `POST .../agency/publication-plans/validate`; propose with `POST .../agency/publication-plans` (`issueId` = the current task, `contentId`, `revisionNumber`, `slots`); stop and wait — the owner's confirmation wakes you; on a rejected card, read the reason and propose again; never post through provider tools for a platform the brand has connected. Keep the existing manual-checklist fallback for unconnected platforms.
- [ ] **Step 2:** Document in `doc/agency-content.md`: setup per platform, proposal/confirmation, worker behavior, failure/unknown-outcome texts, the public-domain requirement for later platforms.
- [ ] **Step 3:** Run `bun run typecheck`, `bun run test:run`, `bun run build`. Expect typecheck and build to pass; tests pass except the 7 known pre-existing failures (`ai-connections` 4, `workspace-runtime` 2, `runner-api` 1) — report any other failure.
- [ ] **Step 4:** Live proof (needs the user's Facebook Page token; if not provided, record "not run"): connect a test Page, schedule text, photo, carousel and video posts 2 minutes ahead, confirm each URL opens the post; record results in `doc/agency-content.md` under "Live proof".
- [ ] **Step 5: Commit** `docs(agency): document connected-account publishing` and push to `main`.

---

## Later plans (not part of Plan 1)

- **Plan 2 — X:** OAuth 1.0a request signing, `GET /2/users/me` verify, media upload (`/2/media/upload`, chunked for video), `POST /2/tweets` with up to 4 media ids; `maxTextLength: 280`.
- **Plan 3 — Instagram:** signed public media route (`GET /api/public/agency-media/:token`, HMAC over asset id + publication id + expiry, 1 hour), container → `media_publish`, carousel containers, Reels for video, token expiry display/refresh.
- **Plan 4 — TikTok:** refresh-token exchange with rotated refresh token stored back to the vault, video `FILE_UPLOAD`, photo `PULL_FROM_URL` via the Plan 3 signed route, `SELF_ONLY` until the user's app is audited, `publish_id` status polling as the checkpoint.

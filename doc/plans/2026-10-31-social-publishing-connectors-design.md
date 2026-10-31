# Native social publishing connectors: design (2026-10-31)

Status: design approved by the user on 2026-10-31 ("oke kerjakan"). No code yet.

## Intent

SocialAgent agencies want approved posts to go out on their clients' social
accounts at the scheduled time without a person copy-pasting. Today a
publication is scheduled and an agent is expected to post it "through the
company's connectors" (for example Composio). There is no native connector, no
live proof, and posting depends on an agent run.

This adds native connectors for **Facebook Pages, Instagram, X and TikTok**. The
user connects each account by pasting tokens from a developer app they created
themselves. At the scheduled time the **server** posts the approved snapshot to
every selected platform and records each result.

## Decided by the user

1. Users fill in their own credentials and create their own developer app on
   each platform. Paperclip does not register or own provider apps and does not
   run an OAuth sign-in flow.
2. Every post needs the user's confirmation. The bot (agent) proposes a plan, for
   example "X at 19:00", and asks "is this right?". Only after the user confirms
   does it go into the schedule.
3. One post can go to two or more platforms at the same time, limited to the
   platforms the user has connected.
4. Content can come from the user (their own media and caption) or from the bot.
   The bot then only arranges the schedule. Both use the same flow.
5. The **server** performs the post at the scheduled time, not an agent. The bot
   only arranges and asks for confirmation.
6. Post types in v1: text, single photo, carousel (several photos/videos) and
   video, on every platform that supports the type.

## Goals

- A setup card per platform under Connectors with write-only token fields,
  step-by-step "where to get this" instructions and a **Test** that verifies the
  tokens against the provider (read-only identity call, never a post).
- An agent-facing way to propose a multi-platform schedule for an approved
  content item and ask the user to confirm it.
- On confirmation: one publication row per platform, sharing a group id.
- A server worker that publishes due rows, re-checks approval immediately before
  posting, and stores the post URL or a readable failure per platform.
- Platform/type compatibility is checked when the plan is proposed, not at
  posting time.

## Non-goals

- OAuth "Log in with X/Facebook/TikTok", or a Paperclip-owned provider app.
- Stories, Reels-specific options beyond "video on Instagram is a Reel", polls,
  threads (multi-tweet), first comments, alt text, location tags, user tags.
- LinkedIn and YouTube native connectors (the platform enum keeps them for
  manual posts).
- Analytics, comments or inbox ingestion from the platforms.
- Editing or deleting a post after publication.
- Automatic retry of a failed post. The user reschedules it.

## Anti-goals (a failure even if it "works")

- Posting anything the user did not confirm, or posting a revision other than
  the one confirmed. A new revision or withdrawn approval must stop the post.
- A token appearing in logs, API responses, run transcripts, agent context, or
  error text.
- Double posting when the worker restarts, two servers run, or a request times
  out after the provider accepted it.
- One platform's failure blocking or rolling back another platform's post.
- Media being publicly reachable without a short-lived, unguessable token.

## Constraints

### Platform matrix (provider rules, verify against current docs at build time)

| | Text | Photo | Carousel | Video | Upload model |
|---|---|---|---|---|---|
| X (API v2) | ✅ | ✅ | ✅ up to 4 images | ✅ 1 video | Direct upload (`/2/media/upload`) |
| Facebook Page (Graph API) | ✅ | ✅ | ✅ multi-photo | ✅ | Direct multipart upload |
| Instagram (Graph API, Business/Creator) | ❌ | ✅ | ✅ 2–10 items | ✅ as Reel | Provider pulls from a **public URL** (video may use resumable upload) |
| TikTok (Content Posting API) | ❌ | ✅ photo mode | ✅ photo mode | ✅ | Video: direct `FILE_UPLOAD`; photos: **pull from verified domain URL** |

Mixed image+video carousels are allowed only where the provider allows them
(Instagram). A media item over a provider's size/duration/aspect limit is a
proposal-time error.

### Credentials per platform (the user's own developer app)

- **X:** API Key, API Secret, Access Token, Access Token Secret (OAuth 1.0a user
  context, "Read and write" permission). Posting needs a paid X API tier; Test
  calls `GET /2/users/me`.
- **Facebook Page:** Page ID and a long-lived Page Access Token with
  `pages_manage_posts`, `pages_read_engagement`. Test reads the Page.
- **Instagram:** Instagram business account ID and a long-lived access token with
  `instagram_content_publish` (via Facebook Login) or the Instagram Login
  equivalent. Long-lived tokens expire after ~60 days; the connection shows the
  expiry when the provider reports it and the worker refreshes it when the token
  type supports refresh.
- **TikTok:** Client Key, Client Secret, Refresh Token (scope `video.publish`,
  plus `video.upload` if drafts are used). Access tokens last 24 hours; the
  worker exchanges the refresh token and stores the rotated refresh token.
  Until the user's app passes TikTok's audit, posts are limited to
  `SELF_ONLY` privacy; the setup card says so, and the publication records the
  privacy actually used.

### Public media URL

Instagram and TikTok photo posts need media at a public HTTPS URL. The server
issues a short-lived signed URL for the exact snapshot asset (HMAC over asset
id, publication id, expiry; ~1 hour; checks the stored SHA-256). It is built on
the configured public base URL (`PAPERCLIP_PUBLIC_URL` / `SOCIALAGENT_PUBLIC_URL`).
Without a public base URL, Instagram and TikTok photo/carousel targets are
rejected at proposal time with "needs a public domain"; X, Facebook and TikTok
video still work. TikTok additionally requires the user to verify that domain in
their developer app; the setup card explains this.

### Existing system to build on (from code review)

- Publications: `packages/db/src/schema/agency_publications.ts`, one platform per
  row, statuses `scheduled|published|failed|cancelled`, dispatch `agent|manual`,
  `externalUrl`, `failureReason`. Service `server/src/services/agency-publications.ts`.
- Content approval: `POST /content-items/:id/decisions` (approve) stays a
  required step. Publications copy the approved snapshot.
- Credentials: `writeConnectionCredential` into `company_secrets`; server-side
  resolution without an agent run follows the chat-channel pattern
  (`server/src/services/chat-channels/credentials.ts`, `actorType: "system"`).
- Reviewed REST adapters: `server/src/services/connectors/rest-registry.ts`,
  Browser Use Cloud as the precedent (`rest_api` + `api_key` app definition).
- Confirmation: `request_confirmation` issue interactions, with the precedent
  that a typed sub-payload (`toolAction`, `secretProposal`) executes its side
  effect on accept.
- Durable background work: `createDeliveryWorkCoordinator` queues with
  `nextRunAt` (template: `registerBrowserUseCleanup`).
- Latest migration is `0386_rls_lockdown.sql`; new tables need the same RLS
  treatment.

## How it works

1. **Connect.** The user opens Connectors → Facebook / Instagram / X / TikTok,
   pastes tokens, presses Test. The connection is company-scoped (organization
   grant), named by the account it verified (for example `@brand on X`). A brand
   can have one connection per platform; several brands can each have their own.
2. **Content.** The user uploads media and a caption, or the bot produces them,
   through the existing content item flow. The owner approves the revision.
3. **Propose.** The bot calls a new publication-proposal capability with the
   content id, revision number, and slots `[{platform, connectionId,
   scheduledAt}]`. The server validates: approval current, connection healthy
   and same brand/company, platform supports the media mix, sizes/limits, public
   URL availability, time ≥ 60 s ahead. Errors come back to the bot to fix before
   anything is shown to the user.
4. **Confirm.** The server opens a `request_confirmation` interaction on the
   bot's task with a `publicationProposal` sub-payload. The card shows a preview
   per platform (caption as it will be posted, media thumbnails, account, local
   time). Accept creates the publication rows (`dispatch: "connector"`, shared
   `groupId`); reject records the reason and wakes the bot to revise.
   Owners can also schedule directly from the content page without the bot.
5. **Publish.** A `agencyPublications` delivery queue wakes at the earliest due
   row. It claims rows atomically (`scheduled → publishing`), re-checks approval
   and connection, resolves credentials, uploads media, posts, and stores
   `externalUrl` + `providerPostId` (`published`) or a sanitized
   `failureReason` (`failed`). Each platform row is independent.
6. **See it.** The calendar and content page show per-platform status, links and
   failures. Failed rows can be rescheduled by the owner.

### Idempotency

A row in `publishing` with a provider request already sent is not re-sent
blindly after a crash. The adapter records a per-step checkpoint (for example
the Instagram container id or TikTok `publish_id`) before the final call and
resumes from it; where a provider cannot tell us whether a post exists, the row
becomes `failed` with "outcome unknown, check the account" rather than posting
twice.

## Calls made by the designer (not yet confirmed by the user)

- **Brand binding.** Setup asks which brand the account belongs to. A new
  brand↔connection mapping (one connection per platform per brand) stores it;
  connections and grants stay company-scoped. A proposal slot must use a
  connection mapped to the content's brand.
- **Posted text.** The posted text is the snapshot `caption` (hook/CTA are
  planning fields, not appended). A slot may carry an optional per-platform text
  override, for example a shorter X version. The override is shown on the
  confirmation card and stored on the publication row, so confirming the card
  approves that exact text. Text over a platform limit is rejected at proposal
  time, never truncated.
- **Who confirms.** Only an active agency owner can accept a
  `publicationProposal` card, the same authority as approving content. An owner
  scheduling directly from the content page counts as confirmation; no card.
- **Existing dispatch.** `agent` and `manual` stay for platforms without a native
  connector (LinkedIn, YouTube, other). For Facebook, Instagram, X and TikTok,
  `agent` dispatch is refused when the platform has a native connection, so an
  agent cannot post the same row through Composio as well. Existing scheduled
  rows are not migrated.
- **Invalidation.** When approval stops being current (new revision, withdrawn
  approval, brand/client context change), every `scheduled` connector row of
  that content becomes `cancelled` immediately with the reason shown on the
  calendar. The worker still re-checks approval before posting.
- **Media limits.** Proposal-time checks cover media type, count and byte size
  only. No media probing (ffprobe) is added; duration/dimension rejections from
  the provider surface as a readable `failed` reason.

## Left to the builder

- Exact schema changes (new `publishing` status, `connector` dispatch,
  `groupId`, `connectionId`, `providerPostId`, checkpoint jsonb) and migration
  0387 with RLS.
- Whether the four platforms are one `social-publishing` service with per-provider
  adapters or four modules; keep provider payloads isolated per provider.
- App-definition JSON per platform, icons following `CONNECTOR-ICONS.md`, and
  permission-review entries in `tool-method-permission-reviews.json`.
- Caption limits and truncation policy (reject, do not truncate silently).
- How the bot discovers the proposal capability (agent API/skill text).
- Tests: fixture-backed provider HTTP for every adapter and type, worker
  claim/crash/double-server tests, token redaction tests, proposal validation.
- Live proof against real test accounts is required before calling a platform
  supported; record it per platform and type, and say "not run" where missing.
- Order of delivery: suggested Facebook → X → Instagram → TikTok (easiest first),
  each shippable on its own.

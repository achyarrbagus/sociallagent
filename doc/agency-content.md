# Agency content production and owner review

Implemented scope: brand/campaign ideas, immutable content revisions, retained
production-task sources, owner decisions and a review UI at `/content`.
Company remains the agency; clients do not approve or log in.

## Business flow

1. An owner creates an idea for an active brand and one of its campaigns.
2. Creative research can be assigned through ordinary tasks. Assigned production
   agents may save revisions; the item remains an idea until owner selection.
3. Owner selects the idea. Copywriting/design/SEO/marketing work uses normal issue
   assignment and execution, with explicit content links.
4. Producers save complete new revisions and submit the current version for review.
5. Owner approves, requests changes with feedback, or rejects. Changes require a
   fresh revision; owner can assign a further production task when necessary.

Task completion never approves content. Selecting an idea never approves the
final version. Approved content is not published automatically.

## APIs and authority

All paths start with `/api/companies/:companyId/content-items`.

| Method and suffix | Behavior | Authority |
|---|---|---|
| GET collection | Filtered content summaries, opaque cursor pages | Authorized campaign and all retained source access |
| POST collection | Create an idea with brandId/projectId and snapshot fields | Active agency owner or trusted local implicit board |
| GET `/:contentId` | Current snapshot, task links and approval validity | Authorized campaign and all retained source access |
| GET `/:contentId/revisions` | Revision metadata, 20 per page; optional before | Same read boundary |
| GET `/:contentId/revisions/:revisionNumber` | Immutable snapshot and its decisions | Same read boundary |
| POST `/:contentId/revisions` | Append a complete snapshot; clear approval | Owner or currently assigned authorized production agent |
| POST `/:contentId/submit` | Request review of the exact production revision | Owner or currently assigned authorized production agent |
| POST `/:contentId/decisions` | select_idea, approve, request_changes, reject | Active agency owner, rechecked under lock |
| POST `/:contentId/tasks` | Retain a same-campaign source issue and work role | Active agency owner |

Writes to existing content require `expectedRevisionNumber`. Stale revisions or
state changes return 409. Review is serialized with revision creation. Two
simultaneous approvals cannot create two accepted decisions. New revision writes
use the complete intended title, idea, hook, caption, script, CTA, format,
targetAccount and attachmentIds; omitted optional fields mean empty values.

Human non-owners can read authorized content but cannot mutate this slice.
Agent writers must currently own an open linked production task and pass its
existing issue mutation authorization. A role title grants no extra permission.

## Approval and context freshness

Snapshots record brand/client context timestamps, campaign description, caption,
script, format, target-account planning reference, and attachment asset identities
with SHA-256, MIME and size. Client/brand edits and campaign description, brand
binding or archive changes invalidate waiting/accepted approvals transactionally.
Restoring an old campaign binding does not revive a prior approval.

`approvalValid` is authoritative for this content review scope. Reads also check
current parent context and asset metadata; stored status alone is insufficient.
The target account remains a planning reference. Owner-managed social account
bindings are available for Facebook Pages, X user accounts, and LinkedIn member
profiles. The server verifies each provider identity, stores credentials through
Paperclip's encrypted secret store, and returns identity/status only. X requires a
user-context OAuth 2.0 token; LinkedIn currently supports member profiles with
`openid`, `profile`, and `w_member_social`, not organization Pages. These account
bindings alone do not publish. Automatic dispatch is an explicit calendar
choice and requires a same-brand, same-platform active account at schedule time;
the dispatcher rechecks approval, context, account and media before sending.

## Private sources and history

Every linked source task remains part of content authorization, including earlier
revisions. Source identity is retained after task deletion. Missing tasks/assets
fail closed with 404; deleting a source does not publish historical content.
Access revocation hides content from affected readers rather than showing cached
body text after a failed refetch. Do not delete source tasks or assets needed by
retained content history; this slice does not add source-recovery administration.

Attachments must be actual same-company authorized attachments of linked tasks.
Revisions capture immutable asset metadata, not arbitrary external image URLs.
Source asset IDs are retained across revisions, even when omitted from a later
snapshot, so historical asset ACLs cannot disappear. The editor waits for a fresh
attachment inventory before constructing a new revision.

The production preparation UI uses existing issue APIs: create idempotently in
backlog, link to content, then activate only a backlog task through the existing expectedStatusVersion guard. Retries preserve
todo/in_progress/done/cancelled tasks. New tasks contain a content reference and
instructions, never copied private captions, ideas, scripts or titles. The
assigned agent still needs permission to all original sources. Failed linking
does not activate the task. Request keys are stable per content/revision/role/agent.

## Bounded reads and persistence

- Content listing scans at most 50 candidates per continuation, reauthorizing each
  under the current actor. Filters use effective review state. Encrypted cursors
  hide inaccessible candidate IDs and bind company, actor and filter context.
- Cursor encryption derives a separate key from the existing persisted instance
  secret. Key work happens per page, never per content item; no background polling.
- History metadata uses SQL projection of the title, not complete old snapshots.
- Each revision accepts at most 20 distinct attachments; each item retains at most
  32 task sources and 100 distinct asset sources. Create another content item when
  a deliverable exceeds these bounds.
- Migration `0379_glamorous_sleeper.sql` adds content items, revisions, decisions
  and task-source tables with company-consistent foreign keys and state checks.
- Content cascades with its campaign when a project is explicitly deleted. Company
  deletion keeps its existing task/asset/project ordering. Shared transaction
  advisory locks for content/profile/context work and an exclusive deletion lock
  prevent parent/source lock inversion during concurrent cleanup.
- Agency content, like brand profiles, is not yet part of portability exports.

## Verification scope

Real PostgreSQL/API tests cover lifecycle, owner/agent permissions, stale and
concurrent decisions, source privacy, missing assets, context invalidation and
history. Component/API tests cover the displayed review version, owner controls,
company-switch draft reset and safe task preparation/retry. OpenAPI, migration,
token and type checks are recorded in the implementation plan.

No live agent/provider execution or browser journey is implied by those tests.
Facebook, X, LinkedIn, and TikTok account bindings and adapter operations are
covered with mocked provider responses; this does not prove real provider app
review, permissions, scopes, or API access. The connector dispatcher is covered
with mocked provider responses and exercises due-time claims,
approval/account/media rechecks, checkpoints and ambiguous outcomes; it does not
prove live posting. X supports text and up to four photos; Facebook supports
text or one image; LinkedIn member profiles support text or one image; TikTok
supports one video per post and currently always forces `SELF_ONLY` visibility;
public TikTok posts are not enabled. TikTok photo posts, LinkedIn
Page publishing, and provider OAuth consent screens remain unsupported. Never treat mocked provider tests as live-post proof.

## Social account bindings

Owners can connect one account per platform and brand from **Clients & Brands**.
Facebook uses a Page ID and Page access token; the backend verifies the Page with
the Graph API before persisting and requires `pages_manage_posts` and
`pages_read_engagement`. X uses a user-context OAuth 2.0 access token with
`users.read` and `tweet.write` (also `tweet.read` and `media.write` for photo
publishing); app-only bearer tokens are rejected by identity verification.
LinkedIn currently connects a member profile by access token and
`urn:li:person:…`, verified through the LinkedIn userinfo endpoint, and requires
`openid`, `profile`, and `w_member_social`. LinkedIn organization/Page posting is
not enabled. TikTok uses the owner's Client Key, Client Secret, and a refresh
token granted `video.publish`; the server refreshes access tokens and persists
TikTok's rotated refresh token in the encrypted secret. The TikTok app must have
Content Posting API enabled. TikTok direct posts are currently always forced to `SELF_ONLY`; public
visibility is not enabled by this connector. TikTok may restrict unaudited apps
to private posts, and public posting would require both a TikTok app audit and
future support for selectable privacy settings. Provider app registration,
permissions, API access, TikTok audit, and any X paid tier remain the account
owner's responsibility.

Credentials are company-scoped encrypted secrets and never returned by the API.
Disconnect removes the local binding and secret but does not revoke the token at
the provider; owners should revoke it in provider settings when needed. These
manual token-entry forms are not OAuth consent flows. The Facebook adapter posts
text or one image; X posts text or one-to-four photos; LinkedIn member profiles
post text or one image; TikTok direct-posts one MP4, MOV, or WebM video with a
caption. TikTok text-only, photo, and carousel posts and LinkedIn Page posts are
not supported. TikTok videos are always private (`SELF_ONLY`) in this connector;
public visibility is not enabled, even if the developer app later passes TikTok's
audit.

For `dispatch: "connector"`, the server claims due work atomically and sends the
approved caption/assets through the selected provider adapter. Before sending it
rechecks the exact approved revision, brand/client/campaign context, active
company-scoped account, token availability and immutable asset metadata/checksum.
Provider timeouts, missing post IDs and expired claims become `unknown`; they are
never retried automatically. The owner must verify the provider account and
confirm whether the post exists. `agent` still creates a Publishing Coordinator
handoff, and `manual` remains owner-published.

## Content calendar (SocialAgent)

Owners schedule an approved revision on a platform (Instagram, Facebook,
TikTok, LinkedIn, X, YouTube or other) from the content page, and see every
post on **Calendar** (`/calendar`). A publication stores the approved
revision number and a copy of its snapshot (caption, script, assets), so it
posts exactly what the owner approved.

- `POST /api/companies/:companyId/agency/publications` (owner) schedules
  approved content. Optional `socialAccountId` binds it to an active account
  from the same company, brand and platform; the server rejects mismatched or
  revoked accounts. `dispatch: "connector"` requires that binding and publishes
  automatically at the scheduled time. `dispatch: "agent"` creates a one-off
  routine in the brand's timezone for the Publishing Coordinator (or the Agency
  Director when there is none); `dispatch: "manual"` leaves the post to the owner.
- `dispatch: "agent"` creates a one-off routine and hands the approved
  snapshot and reporting API to the assigned Publishing Coordinator. It does
  not invoke provider adapters. `dispatch: "manual"` leaves the post for the
  owner to publish and record.
- A new revision or withdrawn approval makes `approvalCurrent` false; scheduled
  posts are not sent, and manually marking one published returns 409. Connector
  posts that time out are shown as `unknown` for owner verification; they cannot
  be automatically retried. The owner can record the verified outcome.
- `POST .../publications/:id/cancel` (owner) cancels a scheduled post.
  Completing or cancelling archives the routine so it never fires again.

## Brand reports (SocialAgent)

**Reports** (`/reports`) shows each active brand for a month: current content
by status, revisions approved in the month, posts scheduled in the month by
status, published posts by platform with links, and the SocialAgent AI cost of
work on the brand's projects (cost events whose project belongs to the brand).
"Copy summary for client" copies a plain-text summary with post links.
`GET /api/companies/:companyId/agency/reports/brands?from&to` serves it to board
members of the company; agents are refused.

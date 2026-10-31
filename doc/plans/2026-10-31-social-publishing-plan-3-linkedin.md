# Social Publishing — Plan 3: LinkedIn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand owner connects a LinkedIn member profile or a LinkedIn Page (organization) with their own developer-app access token. Confirmed posts (text, photo, multi-image, video) go out from the server at the scheduled time through the Plan 1 pipeline.

**Architecture:**
- One new adapter, `server/src/services/social-publishing/linkedin.ts`, built on the versioned LinkedIn REST API: `POST /rest/posts`, the Images and Videos upload APIs, and the headers `LinkedIn-Version` and `X-Restli-Protocol-Version: 2.0.0`.
- LinkedIn joins the platform enum, the DB check constraint and the adapter registry.
- Accounts, vault, plans, confirmation, worker, cancellation and UI are reused from Plan 1.
- The existing `linkedin` value in `AGENCY_PUBLICATION_PLATFORMS` (manual/agent dispatch) stays. Plan 1's agent-dispatch refusal then applies automatically once a LinkedIn account is connected.

**Tech Stack:** TypeScript, Drizzle migration, Vitest with recorded fake `fetch`.

**Spec:** `doc/plans/2026-10-31-social-publishing-connectors-design.md`. **Depends on:** Plan 1 merged; Plan 2 optional.

## Global Constraints

- All Plan 1 Global Constraints apply.
- API base: `https://api.linkedin.com/rest`.
- Headers: `Authorization: Bearer {accessToken}`, `LinkedIn-Version: {LINKEDIN_API_VERSION}`, `X-Restli-Protocol-Version: 2.0.0`.
  - `LINKEDIN_API_VERSION` is a single constant in `YYYYMM` format, for example `"202510"`. Confirm the newest supported version during live proof; LinkedIn retires versions about a year after release.
- **Author:**
  - A member profile posts as `urn:li:person:{id}` and needs the `w_member_social` scope.
  - A Page posts as `urn:li:organization:{id}` and needs `w_organization_social`. That scope requires LinkedIn's Community Management API product approval for the user's app; the setup card states this.
- The text limit is 3000 characters.
- Access tokens live about 60 days.
  - `tokenExpiresAt` is set at connect time from the optional "Token expires" date the user enters, or left unknown.
  - The account turns `needs_reconnect` when a call returns `401`.
  - No refresh flow, because refresh tokens are only issued to approved partner apps.
- Media is uploaded directly (initialize the upload, then `PUT` the bytes), so no public URL is needed.

## Review Focus

1. **Expired token at posting time.** Expect: the row fails with `"{displayName} needs to be reconnected: LinkedIn rejected the access token."`, and the account turns `needs_reconnect`. Other rows of the group are unaffected. (Task 2 test.)
2. **Page token without organization permission.** Expect: verify fails at connect with a readable reason naming `w_organization_social`, and nothing is stored. (Task 2 test.)
3. **Video still processing after upload.** Expect: the adapter polls the video status until `AVAILABLE`, at most 10 polls, before posting; `PROCESSING_FAILED` returns a readable reason. (Task 2 test.)
4. **Crash after media upload.** Expect: the uploaded image/video URNs are saved in the checkpoint and reused; `finalSent` is saved before `POST /rest/posts`. (Task 2 test.)
5. **LinkedIn "little text" escaping.** Commentary must escape `\ | { } @ [ ] ( ) < > # * _ ~` so the text is posted literally, without accidental mentions or hashtags markup breaking the post. Expect: the exact visible text. (Task 2 test.)

---

### Task 1: Add LinkedIn to the connector platforms

**Files:**
- Modify: `packages/shared/src/validators/agency-social.ts`: `SOCIAL_CONNECTOR_PLATFORMS` adds `"linkedin"`.
- Modify: `packages/db/src/schema/agency_social_accounts.ts`: the platform check adds `'linkedin'`.
- Create: migration `0388_*` (generated; snapshot retention as per repo convention).
- Test: extend `server/src/__tests__/agency-social-schema.integration.test.ts`.
- [ ] **Step 1: Write the failing test** `accepts a linkedin social account`.
- [ ] **Step 2: Run.** Expect: FAIL (check violation).
- [ ] **Step 3: Implement.** Then run `bun run db:generate`.
- [ ] **Step 4: Run** the test and `bun run typecheck`. Expect: PASS.
- [ ] **Step 5: Commit** `feat(agency): allow LinkedIn social accounts`.

### Task 2: LinkedIn adapter

**Files:**
- Create: `server/src/services/social-publishing/linkedin.ts`, `server/src/services/social-publishing/linkedin.test.ts`
- Modify: `server/src/services/social-publishing/adapters.ts` (register), `server/src/services/agency-social-accounts.ts` (map a `401` from verify/publish to `needs_reconnect`, if Plan 1 does not already)

**Interfaces:**
- Produces `linkedinAdapter: SocialAdapter`.
- `label`: `"LinkedIn"`.
- `credentialFields`:
  - `accessToken` ("Access token"). Help: "LinkedIn developer portal → your app → Auth → generate a token with w_member_social (profile) or w_organization_social (Page)."
  - `authorUrn` ("Post as"). Help: "urn:li:person:… for your profile or urn:li:organization:… for a Page."
- `rules`:
  - Text: `maxTextLength: 3000`.
  - Shapes: `["text","photo","carousel","video"]`; `carousel: { min: 2, max: 20, allowVideo: false }`.
  - Size limits: `maxImageBytes: 36 MB`, `maxVideoBytes: 500 MB`.
  - Types: `imageTypes: ["image/jpeg","image/png","image/gif"]`, `videoTypes: ["video/mp4"]`.
  - `publicUrlShapes: []`.
- `verify`:
  - Person: `GET https://api.linkedin.com/v2/userinfo` must return `sub` equal to the URN id. `displayName` = `name`.
  - Organization: `GET /rest/organizations/{id}`. `displayName` = `localizedName`.
  - Then check write access with `GET /rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR`, filtered to that organization. A missing role fails with `"LinkedIn did not grant posting rights for this Page (w_organization_social)."`.
- `publish`:
  - Images: `POST /rest/images?action=initializeUpload` with `{ initializeUploadRequest: { owner: authorUrn } }`, then `PUT` the bytes to `uploadUrl`. Save each `image` URN to `checkpoint.imageUrns`.
  - Video: `POST /rest/videos?action=initializeUpload` with `fileSizeBytes`, then `PUT` each part. Keep the returned ETags, call `POST /rest/videos?action=finalizeUpload`, and poll `GET /rest/videos/{urn}` until `AVAILABLE`. The checkpoint holds `videoUrn` and `videoFinalized`.
  - Post: save `finalSent: true`, then call `POST /rest/posts` with `{ author, commentary: escapeLittleText(text), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, content? }`.
    - Content: `{ media: { id } }` for one image or video, or `{ multiImage: { images: [{ id }, …] } }` for a carousel.
    - The post URN comes from the `x-restli-id` response header. `externalUrl` = `https://www.linkedin.com/feed/update/{urn}`.
  - Failure reasons:
    - `"LinkedIn refused the post: {message}"` (redacted).
    - On `401`: `"{displayName} needs to be reconnected: LinkedIn rejected the access token."`.
    - `"Could not reach LinkedIn: …"`.
- Produces `export function escapeLittleText(text: string): string`.
- [ ] **Step 1: Write failing tests** (recorded fake `fetch`):
  - `verifies a member profile`
  - `verifies a Page and refuses one without posting rights`
  - `posts text with escaped commentary`
  - `posts one image`
  - `posts a multi-image carousel`
  - `uploads, finalizes and waits for a video`
  - `resumes from saved media URNs`
  - `saves finalSent before creating the post` (ordered event log)
  - `marks an expired token for reconnection`
  - `redacts the token from errors`
- [ ] **Step 2: Run** `cd server && bunx vitest run src/services/social-publishing/linkedin.test.ts`. Expect: FAIL.
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run** the tests and `bun run typecheck`. Expect: PASS.
- [ ] **Step 5: Commit** `feat(agency): add LinkedIn publishing adapter`.

### Task 3: UI help, agent instructions, docs, live proof

**Files:**
- Modify: `ui/src/components/agency/SocialAccountDialog.tsx`:
  - Add the LinkedIn developer-app link `https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api`.
  - Note that Page posting needs Community Management API approval.
  - Add the optional "Token expires" date input. Send it as `tokenExpiresAt`, which the connect schema accepts as an optional ISO date.
- Modify: `packages/shared/src/validators/agency-social.ts` (optional `tokenExpiresAt`), `doc/agency-content.md`, the Publishing Coordinator `AGENTS.md`.
- [ ] **Step 1: Write failing tests:**
  - `shows the LinkedIn developer link and Page approval note`
  - `sends the optional token expiry`
- [ ] **Step 2: Run.** Expect: FAIL.
- [ ] **Step 3: Implement.** Then run `bun run check:token-gates`.
- [ ] **Step 4: Run** `bun run typecheck`, `bun run test:run`, `bun run build`. Expect: only the known pre-existing failures.
- [ ] **Step 5: Live proof** (needs the user's LinkedIn token; otherwise record "not run"): post text, one image, a multi-image carousel and a video to the profile, and to a Page when approved. Open each post by its URL.
- [ ] **Step 6: Commit** `docs(agency): document LinkedIn publishing` and merge into `main`.

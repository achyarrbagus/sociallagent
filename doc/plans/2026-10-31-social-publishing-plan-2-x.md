# Social Publishing — Plan 2: X

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand owner connects an X account with their own developer-app keys; confirmed posts (text, up to 4 photos, or one video) go out from the server at the scheduled time through the Plan 1 pipeline.

**Architecture:** One new adapter, `server/src/services/social-publishing/x.ts`, registered in the Plan 1 registry. It signs every request with OAuth 1.0a user context (HMAC-SHA1, implemented with `node:crypto`), uploads media with the X API v2 media endpoints, then creates the post with `POST /2/tweets`. Everything else (accounts, vault, plans, confirmation, worker, cancellation, UI rows) is reused from Plan 1 unchanged. The UI picks up the new platform from `GET /agency/social-platforms`.

**Tech Stack:** TypeScript, Vitest with recorded fake `fetch`, `twitter-text` for weighted character counting.

**Spec:** `doc/plans/2026-10-31-social-publishing-connectors-design.md`. **Depends on:** Plan 1 merged.

## Global Constraints

- All Plan 1 Global Constraints apply.
- API hosts: `https://api.x.com/2` for posts, users and media. Confirm current media endpoints during live proof (`POST /2/media/upload` for simple image upload; chunked `initialize` / `append` / `finalize` and `GET` status for video).
- Every request carries an OAuth 1.0a `Authorization` header signed with the four user keys. Multipart and JSON bodies are **not** part of the signature base string; query parameters are.
- Posting requires a paid X API tier. A `403`/`429` whose body names the access level or credits becomes the reason `"X refused the post: your X API plan does not allow posting (upgrade in the X developer portal)."`.
- The text limit is 280 **weighted** characters, counted with `twitter-text` `parseTweet(text).weightedLength`. Over the limit → proposal-time error using the Plan 1 message `"X allows at most 280 characters; this text has {weighted}."`.

## Review Focus

1. **Signature with special characters.** Text with emoji, `&`, `+`, `%` and newlines is sent in a JSON body, so it must not change the signature. Expect: valid signature, exact text posted. (Task 1 test `signs requests independent of the JSON body`.)
2. **Video still processing.** Expect: the adapter polls the media status until `succeeded` (max 10 polls, backoff from `check_after_secs`). Then it posts; on `failed` it returns a readable reason, and it never posts without media. (Task 2 test.)
3. **Crash between media upload and the post.** Expect: uploaded media ids saved in the checkpoint and reused on resume. `finalSent` is saved before `POST /2/tweets`. (Task 2 test.)
4. **Paid-tier refusal.** Expect: the readable plan message above, not raw JSON. (Task 2 test.)
5. **Weighted length.** A URL counts as 23 and CJK characters count double. Expect: rejection at proposal time, not at posting. (Task 1 test.)

---

### Task 1: OAuth 1.0a signer, weighted length and X rules

**Files:**
- Create: `server/src/services/social-publishing/oauth1.ts`, `server/src/services/social-publishing/oauth1.test.ts`
- Modify: `server/src/services/social-publishing/types.ts` (optional `countText?: (text: string) => number` on `PlatformRules`, used by `checkPostAgainstRules` instead of `text.length` when present), `server/package.json` (add `twitter-text`)

**Interfaces:**
- Produces:
  - `export function oauth1Header(input: { method: string; url: string; query?: Record<string, string>; consumerKey: string; consumerSecret: string; token: string; tokenSecret: string; nonce?: string; timestamp?: string }): string`.
  - `checkPostAgainstRules` uses `rules.countText` when it is set.
- [ ] **Step 1: Write failing tests:**
  - `matches the X documentation signature example`: use the published example values from X's "Creating a signature" guide. The expected `oauth_signature` must equal the documented value.
  - `signs requests independent of the JSON body`.
  - `percent-encodes reserved characters per RFC 3986`.
  - `uses weighted length when countText is set`: a 270-character text plus one URL is accepted, and 281 weighted characters are rejected.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/services/social-publishing/oauth1.test.ts src/services/social-publishing/types.test.ts`. Expect: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expect: PASS. Then `bun run typecheck`.
- [ ] **Step 5: Commit** `feat(agency): sign X requests with OAuth 1.0a`.

### Task 2: X adapter

**Files:**
- Create: `server/src/services/social-publishing/x.ts`, `server/src/services/social-publishing/x.test.ts`
- Modify: `server/src/services/social-publishing/adapters.ts` (register)

**Interfaces:**
- Produces `xAdapter: SocialAdapter`:
  - **`label`:** `"X"`.
  - **`credentialFields`:**
    - `apiKey` ("API key")
    - `apiKeySecret` ("API key secret")
    - `accessToken` ("Access token")
    - `accessTokenSecret` ("Access token secret")
    - Shared help text: "X developer portal → your app → Keys and tokens. Set app permissions to Read and write before generating the access token."
  - **`rules`:**
    - Text: `maxTextLength: 280`, `countText: weightedLength`.
    - Shapes: `["text","photo","carousel","video"]`; carousel is `{ min: 2, max: 4, allowVideo: false }`.
    - Sizes: `maxImageBytes: 5 MB`, `maxVideoBytes: 512 MB`.
    - Types: `imageTypes: ["image/jpeg","image/png","image/webp","image/gif"]`, `videoTypes: ["video/mp4","video/quicktime"]`.
    - Hosting: `publicUrlShapes: []`.
  - **`verify`:** `GET /2/users/me` returns `{ externalAccountId: data.id, displayName: "@" + data.username, tokenExpiresAt: null }`.
  - **`publish`:**
    - **Images:** upload each one and append its id to `checkpoint.mediaIds` after each upload.
    - **Video:** chunked upload in 4 MB chunks. Save `checkpoint.videoMediaId` after initialize, and `checkpoint.videoFinalized` after finalize. Poll the status as Review Focus 2 describes.
    - **Post:** save `finalSent: true`, then call `POST /2/tweets` with `{ text, media: { media_ids } }`; text-only posts omit `media`.
    - **On success:** `providerPostId = data.id`, `externalUrl = https://x.com/i/status/{id}`.
    - **Failure reasons:**
      - `"X refused the post: {detail}"`, with the detail redacted.
      - The paid-tier message from Global Constraints.
      - `"Could not reach X: …"` for network errors.
- [ ] **Step 1: Write failing tests** (with a recorded fake `fetch`):
  - `verifies the account as @username`.
  - `posts text`.
  - `posts four photos in one post`.
  - `uploads video in chunks and waits for processing`.
  - `resumes from saved media ids`.
  - `saves finalSent before creating the post` (with an ordered event log, as in Plan 1).
  - `explains a paid-tier refusal`.
  - `redacts keys from errors`.
- [ ] **Step 2: Run** `cd server && bunx vitest run src/services/social-publishing/x.test.ts`. Expect: FAIL.
- [ ] **Step 3: Implement and register.**
- [ ] **Step 4: Run.** Expect: PASS. Then `bun run typecheck`.
- [ ] **Step 5: Commit** `feat(agency): add X publishing adapter`.

### Task 3: UI help, agent instructions, docs, live proof

**Files:**
- Modify: `ui/src/components/agency/SocialAccountDialog.tsx`: add a per-platform "How to create a developer app" link for X, `https://developer.x.com/en/docs/apps/overview`, plus the paid-tier note.
- Modify: `doc/agency-content.md` (X section and limits), the Publishing Coordinator `AGENTS.md` (X 280 weighted characters; offer a shorter X text override).
- [ ] **Step 1: Write failing UI test:** `shows the X developer-app link and paid-plan note`.
- [ ] **Step 2: Run.** Expect: FAIL.
- [ ] **Step 3: Implement.** Then run `bun run check:token-gates`.
- [ ] **Step 4: Run** `bun run typecheck`, `bun run test:run`, `bun run build`. Expect: only the known pre-existing failures.
- [ ] **Step 5: Live proof** (needs the user's X keys on a paid tier; otherwise record "not run"): text, 4 photos, video, each opened by its URL.
- [ ] **Step 6: Commit** `docs(agency): document X publishing` and merge into `main`.

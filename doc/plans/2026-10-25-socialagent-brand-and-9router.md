# SocialAgent branding and 9Router implementation plan

**Goal:** Rename the visible application to SocialAgent and let owners connect a 9Router gateway during onboarding.

**Design:** Keep the current interface and gateway connection architecture. Add a named 9Router shortcut with an editable `http://localhost:20128/v1` default, bearer authentication, and the API format required by the selected agent (Responses for Codex, Messages for Claude). Credentials continue through company-scoped managed connections; the existing model selector and connection test remain authoritative. A new adapter or database provider enum would duplicate existing gateway support.

Brand changes cover the shipped UI, page titles, logos/icons, auth display, and startup banner. Technical package namespaces, environment variables, API identifiers and stored data keys retain compatibility. Upstream attribution remains available. No automatic agent runs or external provider credentials are created.

## Work

- [x] Add regression coverage for 9Router defaults, editable endpoints, credential saving and adapter-specific protocol selection.
- [x] Add the onboarding shortcut and reusable setup defaults, preserving generic gateway behavior.
- [x] Replace UI branding and brand assets with SocialAgent.
- [x] Replace runtime/auth display branding and document technical compatibility.
- [x] Run focused connection/onboarding tests, UI token gates, relevant typechecks and build.
- [x] Restart the existing isolated local service and verify health, SocialAgent branding and the 9Router entry in a real browser. Report live provider verification separately when no 9Router credentials are available.

## Review focus

- Custom endpoint edits must reach the saved routing contract.
- API keys must remain masked, never enter local storage, and use the existing credential service.
- Claude and Codex must keep distinct gateway protocols.
- Generic gateways and reconnects retain their existing settings.
- Existing company data, auth sessions and integrations survive the display rename.

9Router endpoint reference: https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/other-tools.md

## Verification

- 9Router form regression: watched the two adapter cases fail before implementation; all 16 provider-setup tests then passed. Final integrated provider-setup/handoff classifiers run: 20 tests passed.
- Existing onboarding gateway save/model-test/hire behavior: both targeted scenarios passed, including failed lookup recovery.
- UI branding: focused auth/invite/title/locale/loading tests 70 passed; tool taxonomy/activity/Cloud/App/sidebar tests 124 passed; legacy/new recovery classification and chat tests 69 passed.
- Runtime branding: auth/OpenAPI 47 passed; shared MCP headers 11 passed. Expanded OAuth/public-MCP/tool-gateway run passed 614 tests and exposed four obsolete brand assertions; those assertions were corrected and all four passed in a focused rerun.
- Shared and server typechecks, UI typecheck and production build passed. Token gates, map alignment and diff whitespace checks passed. This task did not run the full repository test/build matrix; verification focused on branding, connection setup and affected consumers.
- Independent review found one important classifier regression: stored/server handoff notices still use the old brand. Fixed recognition to accept both brands, with legacy/new and quoted-comment regression coverage.
- Browser: dashboard title `Dashboard • socialagent • SocialAgent`; 9Router dialog opens with `http://localhost:20128/v1` and a password input. The onboarding preview blocked all API mutations and created no agents or connections.
- Local 9Router was not listening on port 20128. No live provider inference or successful credential test is claimed. User credentials and a reachable 9Router instance are still required.
- Existing isolated runtime restarted through `pnpm dev:stop` / `pnpm dev:once --data-dir ./tmp/agency-dev`; existing company data retained.

The original CLI executable/package namespace, protocol identifiers, storage keys, historical documentation and long-tail CLI/connector messages remain compatible. Actual upstream Paperclip Cloud/ID and Paperclip Labs attribution remain truthful; these are not names of the local SocialAgent app.

## Follow-up: runner validation and hidden Skills menu

User reported an old-brand unavailable-runner message and requested hiding the Skills menu. Updated the four user-facing runner selection errors at their server source and removed the global Skills item from both sidebar implementations. Existing direct Skills routes and agent capability configuration remain available; this is a navigation change.

Regression assertions failed against the old runner wording and visible Skills item, then passed after the patch: all 232 runner-selection/sidebar tests passed. Token gates, map checks and whitespace checks passed. Browser verification on localhost:3100 confirmed no Skills navigation link, SocialAgent title and no page errors; API health was `ok` with bootstrap ready. The runner's compatibility validation is unchanged: an unsupported selection still requires Legacy runner in Advanced.

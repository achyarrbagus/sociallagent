# SocialAgent Hari ini

**Goal:** Replace the operator-first dashboard with an agency owner's daily overview.

**Design:** Follow the user's `/Users/achyarbagus/Downloads/design (1).md`: periwinkle canvas, warm light surface, blue/yellow/teal KPI cards, coral pill actions, dark outlines and small offset shadows. Translate its Dioxus example to the existing React application. Scope expanded by the user: apply colors and layout language to every page through shared theme tokens, both Layout variants, sidebar branding, breadcrumbs, common UI components and the authentication surface. Preserve each page's workflow.

**Architecture:** Existing company-scoped APIs supply pending content, seven calendar days of publications, brand-linked active projects, tasks and agent health. Keep onboarding, pause/budget notices and plugin dashboard slots. No schema or API changes. New visual values belong in `ui/src/index.css`.

**Expanded scope:** Shared light/dark semantic colors and component geometry; keep the theme toggle functional. Verify dashboard, agency, content, calendar, reports, tasks, agents, apps, settings, dialogs and mobile shell.

**Execution:** Inline, as requested by the user. 12ui draft attempted; unavailable because CLI requires sign-in. Use the supplied written design directly.

- [x] Test real overview derivation: active brand campaigns only, cancelled tasks excluded from completion denominator, publication status and date boundaries respected.
- [x] Implement agency overview with independent loading/error/empty states, honest pagination labels, actionable links and accessible progress indicators.
- [x] Integrate with the dashboard, retain operational blockers, update affected feature maps and design documentation.
- [ ] Run focused tests, UI typecheck/build, token gates and map checks. Inspect the live page at desktop/mobile widths when browser access is available.

**Review focus:** Company changes must remount the overview; failed requests must not appear as zero counts; review pagination must not claim an exact total; time range is explicitly seven days in the viewer's local timezone; no placeholder metrics or nonfunctional controls.

## Verification record

- UI typecheck and production build passed after the final changes.
- 80 targeted shell/auth/overview tests plus the 20-test company-route suite passed (100 distinct tests; the 28-test follow-up includes eight overview tests already in the first set).
- Token gates, map checks and Git whitespace checks passed.
- Live desktop: checked Hari ini in light/dark, content form and keyboard focus, calendar, reports, agency directory, task list, agent roster, connectors, and settings. Also observed a second authorized company with a real campaign/progress row and paused-agent notice. No content/task data was created or submitted.
- Browser viewport override reported success but left innerWidth at 1669; mobile layout is implemented but not live-verified. The viewport override was reset.
- Full UI suite and cross-repository typecheck were attempted, then stopped under resource pressure; neither is claimed green. Full repository test:run/build were not completed. The UI-only build/typecheck and targeted tests above are the completed evidence.
- 12ui remains unavailable without its CLI sign-in. Implementation follows the supplied written design.
- The local authenticated/private preview serves the built UI on 127.0.0.1:3100; health and bootstrap are ready. Artifact upload environment is absent (no assigned Paperclip task in this session); the screenshot is local review evidence, not an uploaded issue artifact.

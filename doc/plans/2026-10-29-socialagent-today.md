# SocialAgent Hari ini

**Goal:** Replace the operator-first dashboard with an agency owner's daily overview.

**Design:** Follow the user's `/Users/achyarbagus/Downloads/design (1).md`: periwinkle canvas, warm light surface, blue/yellow/teal KPI cards, coral pill actions, dark outlines and small offset shadows. Translate its Dioxus example to the existing React application. Scope expanded by the user: apply colors and layout language to every page through shared theme tokens, both Layout variants, sidebar branding, breadcrumbs, common UI components and the authentication surface. Preserve each page's workflow.

**Architecture:** Existing company-scoped APIs supply pending content, seven calendar days of publications, brand-linked active projects, tasks and agent health. Keep onboarding, pause/budget notices and plugin dashboard slots. No schema or API changes. New visual values belong in `ui/src/index.css`.

**Expanded scope:** Shared light/dark semantic colors and component geometry; keep the theme toggle functional. Verify dashboard, agency, content, calendar, reports, tasks, agents, apps, settings, dialogs and mobile shell.

**Execution:** Inline, as requested by the user. 12ui draft attempted; unavailable because CLI requires sign-in. Use the supplied written design directly.

- [ ] Test real overview derivation: active brand campaigns only, cancelled tasks excluded from completion denominator, publication status and date boundaries respected.
- [ ] Implement agency overview with independent loading/error/empty states, honest pagination labels, actionable links and accessible progress indicators.
- [ ] Integrate with the dashboard, retain operational blockers, update affected feature maps and design documentation.
- [ ] Run focused tests, UI typecheck/build, token gates and map checks. Inspect the live page at desktop/mobile widths when browser access is available.

**Review focus:** Company changes must remount the overview; failed requests must not appear as zero counts; review pagination must not claim an exact total; time range is explicitly seven days in the viewer's local timezone; no placeholder metrics or nonfunctional controls.

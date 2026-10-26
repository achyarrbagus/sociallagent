---
navigation: {"section":"Projects and execution","sectionOrder":40,"order":15}
---

# Creative agency

Owners organize clients, brand context and campaigns inside their agency company.

Feature ID: `agency`.

Implementation: [agency directory](../../ui/src/pages/Agency.tsx).

Agent access: [companion](../agent-access-map/agency.md).

## Sub-features

- `profiles`: `agency/profiles` — read and maintain clients, brands, and archived history.
- `campaigns`: `agency/campaigns` — create or associate an existing project with a brand.
- `team`: `agency/team` — install the optional Agency Studio team with creative insight, SEO and Marketing roles.
- `content`: `agency/content` — create ideas, assign production work and preserve revisions.
- `owner-review`: `agency/owner-review` — select ideas and decide final content revisions as the owner.

## How to get to it (user POV)

### `agency-directory`

Open **Clients & Brands** (`/agency`). Owners can add a client, add its brand,
edit the audience/tone/brief/website/timezone, archive or restore profiles, and add
a campaign under the brand. Campaigns retain their existing project pages.

### `agency-team`

Open the existing team catalog and select **Agency Studio**. Review the roster
and runtime/account configuration before installing. Assign Creative Strategist a
brand-scoped request for content ideas; review its task document and select ideas
to develop into production briefs. Selecting an idea does not authorize publishing.

## Driving it with Playwright and the Paperclip CLI

### `agency-directory`

Automated: [API/database coverage](../../server/src/__tests__/agency.integration.test.ts)
exercises owner operations, non-owner denials, company boundaries, archives and
campaign links. [UI tests](../../ui/src/pages/Agency.test.tsx) cover a save failure,
read-only controls and resetting drafts when switching companies. These are not
live browser or real-agent journey evidence.

Manual: in a disposable company, add two clients/brands, edit one brief, attach a
project and reload. Verify each campaign is under the intended brand. Archive its
client, enable Show archived, and inspect retained context. Repeat as a viewer;
mutation controls must be absent. Switch companies while a form is open and verify
the old draft does not follow.

### `agency-team`

Automated: [catalog tests](../../packages/teams-catalog/src/shipped-catalog.test.ts)
validate shipped roster, reporting lines and manifest hashes. Actual agent
execution and the team import UI journey remain unverified.

## Gotchas

- Profiles are company-readable; brand labels are not ACLs or filesystem isolation.
- No client login or client approval flow is added.
- **Content & Review** (`/content`) provides content revision review, not a publication scheduler.
- Agency profiles are not yet in company portability exports.
- Installing role instructions grants no new provider or owner permissions.

### `content-review`

Open a brand's **View content** link or **Content & Review**. Create an idea for a
brand campaign, assign creative research as needed, select the idea, then assign
copy/design work. Production tasks use normal task pages for files and execution.
Save a new revision with its chosen task attachments and submit to owner. Verify
only the owner can approve, reject or request changes. Change a caption/account or
brand context and confirm prior approval no longer applies. Open an older revision
to inspect its snapshot and decisions; explicitly review the latest before acting.

Automated: [content API/database tests](../../server/src/__tests__/agency-content.integration.test.ts),
[review component](../../ui/src/components/agency/ContentReview.test.tsx),
[content directory](../../ui/src/pages/AgencyContent.test.tsx) and
[task preparation](../../ui/src/api/agency-content.test.ts). No live agent or browser
proof is claimed. Source deletion fails closed; avoid deleting retained task/assets.

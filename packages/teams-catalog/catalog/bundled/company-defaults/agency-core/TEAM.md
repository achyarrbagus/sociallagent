---
name: Agency Core
description: Default creative agency team for a new Paperclip company, with an Agency Director leading an account manager, strategy group, and production group, plus a recurring director review task.
schema: agentcompanies/v1
slug: agency-core
category: company-defaults
key: paperclipai/bundled/company-defaults/agency-core
manager: agents/agency-director/AGENTS.md
includes:
  - agents/account-manager/AGENTS.md
  - agents/publishing-coordinator/AGENTS.md
  - agents/performance-analyst/AGENTS.md
  - agents/creative-strategist/AGENTS.md
  - agents/content-strategist/AGENTS.md
  - agents/seo-specialist/AGENTS.md
  - agents/marketing-strategist/AGENTS.md
  - agents/creative-director/AGENTS.md
  - agents/copywriter/AGENTS.md
  - agents/scriptwriter/AGENTS.md
  - agents/designer/AGENTS.md
  - projects/agency-operations/PROJECT.md
defaultInstall: true
recommendedForCompanyTypes:
  - agency
  - marketing
  - content
tags:
  - default
  - agency
  - creative
  - social-media
---

# Agency Core

Agency Core is the bundled default install for a new Paperclip company. The company represents a creative agency; the human owner directs it, and clients and brands belong to the agency. An Agency Director leads three heads, each with their own group.

## Contents

- `Agency Director` - sets priorities across brands, delegates to the three heads, and reports to the owner. Has the only recurring task.
- `Account Manager` - delivery coordination. Manages the `Publishing Coordinator` and `Performance Analyst`.
- `Creative Strategist` - leads the strategy group: `Content Strategist`, `SEO Specialist` and `Marketing Strategist`.
- `Creative Director` - leads the production group: `Copywriter`, `Scriptwriter` and `Creative Designer`; owns execution quality and brand consistency.
- `agency-operations` - starter project owned by the Agency Director.
- `director-review` - recurring Director task to review priorities across brands, list content waiting for the owner's decision, and assign the next useful task.

Only the human owner approves final content. Agent instructions do not create new platform permissions, and specialists wake only on assignment. Agency Studio remains available as an optional team.

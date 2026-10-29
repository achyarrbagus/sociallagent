# Connect 9Router to SocialAgent

## Managed gateway (no owner credential)

An operator can provide 9Router for every company. Set these in the server environment and restart SocialAgent:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SOCIALAGENT_9ROUTER_API_KEY` | yes | — | 9Router API key. Enables the managed gateway. |
| `SOCIALAGENT_9ROUTER_BASE_URL` | no | `https://9router.amifish.com/v1` | Gateway URL. HTTPS, or HTTP on localhost. |
| `SOCIALAGENT_9ROUTER_ADAPTER` | no | `claude_local` | Onboarding agent: `claude_local` or `codex_local`. |
| `SOCIALAGENT_9ROUTER_CLAUDE_MODEL` | no | first gateway model | Preferred Claude model ID. |
| `SOCIALAGENT_9ROUTER_CODEX_MODEL` | no | first gateway model | Preferred Codex model ID. |

When the key is set, **Connect a model** does not ask for a key. Onboarding calls `POST /api/companies/:companyId/onboarding/managed-gateway`. That route stores the key once per company and protocol as a shared AI connection named `9Router (Claude)` or `9Router (Codex)`, installed for all agents. The route reuses the connection on replay. The owner confirms the model and presses **Connect**. The agent connection test still runs before the hire. The agency team specialists use the Director's shared connection.

The key stays on the server. `GET /api/companies/:companyId/onboarding/managed-gateway` reports only `enabled`, `name` and `defaultAdapterType`. Creating the connection needs the same permission as saving a shared AI connection, and it writes `ai_connection.connected` to the activity log. A changed key in the environment does not rotate connections that already exist. Rotate those connections from the company's AI connection settings.

## SaaS lock and admin-managed models

With the managed gateway configured, SocialAgent runs as a SaaS: only an instance admin chooses adapters, models and AI connections.

- **Admin page:** Settings → **AI models** (`/company/settings/instance/ai-models`, instance admins only). Pick a default model and a model per agent role from the 9Router model list. **Save and apply** stores the policy in `instance_settings.ai_models` and moves every agent on a managed 9Router connection, in every company, to the model for its role. The page also lists every agent with its role, model and connection.
- **Model resolution:** role model → admin default model → `SOCIALAGENT_9ROUTER_CLAUDE_MODEL` / `SOCIALAGENT_9ROUTER_CODEX_MODEL`.
- **Server lock** for everyone who is not an instance admin, board users and agents alike:
  - Hires and direct creates (`POST /companies/:id/agent-hires`, `POST /companies/:id/agents`) are forced onto the managed adapter (`SOCIALAGENT_9ROUTER_ADAPTER`), the model for the agent's role and the company's shared 9Router connection.
  - `PATCH /agents/:id` keeps the agent's adapter, model and AI connection; other fields still apply. Config rollbacks that would change them return 403 `ai_models_managed`.
  - Creating, defaulting, pooling, editing or removing AI connections returns 403 `ai_models_managed`.
  - Team catalog installs ignore `adapterOverrides`; installed agents on the managed adapter join the managed connection with their role models. The agency-core team does the same.
- **Hidden from company users:** the Apps page omits AI connections (the 9Router connection) and AI provider apps; opening one by id returns 404. Agent routes for instructions, permissions, API keys, revision rollback, connection-intent adoption, Claude login and project access return `403 agent_settings_managed`, and `PATCH /agents/:id` ignores configuration fields outside onboarding setup (profile fields and status still apply).
- **UI for company users:** the agent form shows the model read-only, bulk model edits are hidden, AI connection forms show a managed notice, and **New agent** asks only for a name and role.

- **Existing agents:** **Move N agents to SocialAgent AI** on the AI models page (`POST /api/instance/ai-models/adopt`) puts every eligible agent on the managed adapter, its role's model and its company's shared connection. Built-in and plugin agents, and agents on remote or custom adapters, are skipped. A company without a managed connection gets one created for its admin or owner.
- **Onboarding:** with the gateway on, the connect step shows no source tiles and starts the hire on its own; Connect stays available for a retry.
- Per-agent adapter, model and connection controls are read-only for everyone, admins included. Admins change models at Settings → AI models.

- **Connectors:** Settings → **Connectors** (instance admins) lists the Apps catalog (AI providers excluded) plus "Custom server" for URL-added MCP/REST servers. Company users see and connect only checked apps; the list starts empty. The server enforces it on the gallery, preflight, app connect, application and connection create, and chat channel create (`403 connector_not_allowed`). Existing connections keep working.

Admin endpoints: `GET`/`PUT /api/instance/settings/ai-models`, `GET`/`PUT /api/instance/settings/connectors`, `POST /api/instance/ai-models/adopt`, `GET /api/instance/ai-models/catalog` (fetched server-side with the operator key) and `GET /api/instance/ai-models/agents`.

Company imports and team catalog installs put their new agents on SocialAgent AI with the model for each agent's role. Built-in, plugin and remote agents keep their own setup.

## Manual connection

During onboarding, choose Codex or Claude Code on **Connect a model**, switch to **API keys**, then click **Connect 9Router**.

1. Enter the 9Router API base URL. This SocialAgent deployment defaults to `https://9router.amifish.com/v1`; change it for your own gateway. A local 9Router typically uses `http://localhost:20128/v1`. Remote endpoints require HTTPS.
2. Enter an API key issued by your 9Router dashboard. The field is masked and the existing managed connection service stores the credential. It is never saved in the onboarding browser draft.
3. Save the connection. Select or enter a model ID available through your 9Router instance, then press **Connect** to test it with the selected agent.

Codex uses the Responses API; Claude Code uses the Messages API. SocialAgent chooses the format for the selected agent. 9Router remains a managed gateway connection and follows existing company ownership and agent-access rules. The **Change** control in the connection form lets the owner adjust credential sharing.

The URL must be reachable from the agent's execution environment. `localhost` refers to that environment: an agent running in a remote sandbox cannot use a gateway that exists only on your laptop. Starting SocialAgent does not start a 9Router server.

The generic **Use a custom gateway** path remains available. Saving a gateway does not claim the model is connected: the agent connection test still has to succeed.

Provider references: [9Router endpoints](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/other-tools.md), [Codex integration](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/codex.md), [Claude Code integration](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/claude-code.md).

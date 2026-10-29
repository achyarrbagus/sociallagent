# Connect 9Router to SocialAgent

During onboarding, choose Codex or Claude Code on **Connect a model**, switch to **API keys**, then click **Connect 9Router**.

1. Enter the 9Router API base URL. This SocialAgent deployment defaults to `https://9router.amifish.com/v1`; change it for your own gateway. A local 9Router typically uses `http://localhost:20128/v1`. Remote endpoints require HTTPS.
2. Enter an API key issued by your 9Router dashboard. The field is masked and the existing managed connection service stores the credential. It is never saved in the onboarding browser draft.
3. Save the connection. Select or enter a model ID available through your 9Router instance, then press **Connect** to test it with the selected agent.

Codex uses the Responses API; Claude Code uses the Messages API. SocialAgent chooses the format for the selected agent. 9Router remains a managed gateway connection and follows existing company ownership and agent-access rules. The **Change** control in the connection form lets the owner adjust credential sharing.

The URL must be reachable from the agent's execution environment. `localhost` refers to that environment: an agent running in a remote sandbox cannot use a gateway that exists only on your laptop. Starting SocialAgent does not start a 9Router server.

The generic **Use a custom gateway** path remains available. Saving a gateway does not claim the model is connected: the agent connection test still has to succeed.

Provider references: [9Router endpoints](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/other-tools.md), [Codex integration](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/codex.md), [Claude Code integration](https://github.com/decolua/9router/blob/master/gitbook/content/en/integration/claude-code.md).

import { AuthProviders } from "../auth/AuthProviders";
import { AssistantConnectionsPage } from "@/pages/McpConnect";

export default function AssistantConnectionsRoute() {
  return (
    <AuthProviders>
      <AssistantConnectionsPage />
    </AuthProviders>
  );
}

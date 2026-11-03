import { McpConnectPage } from "@/pages/McpConnect";
import { AuthProviders } from "../../auth/AuthProviders";

export default function DotConnectRoute() {
  return (
    <AuthProviders>
      <McpConnectPage agentPairingOnly />
    </AuthProviders>
  );
}

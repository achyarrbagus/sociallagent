import { McpConnectPage } from "@/pages/McpConnect";
import { AuthProviders } from "../../auth/AuthProviders";

export default function McpConnectRoute() {
  return (
    <AuthProviders>
      <McpConnectPage />
    </AuthProviders>
  );
}

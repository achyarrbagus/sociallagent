import { McpDevicePage } from "@/pages/McpConnect";
import { AuthProviders } from "../auth/AuthProviders";

type McpDeviceSearchParams = Promise<{ user_code?: string | string[] }>;

export default async function McpDeviceRoute({
  searchParams,
}: {
  searchParams: McpDeviceSearchParams;
}) {
  const params = await searchParams;
  const initialCode = Array.isArray(params.user_code)
    ? params.user_code[0] ?? ""
    : params.user_code ?? "";

  return (
    <AuthProviders>
      <McpDevicePage initialCode={initialCode} />
    </AuthProviders>
  );
}

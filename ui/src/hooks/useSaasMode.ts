import { useQuery } from "@tanstack/react-query";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Whether the server runs in multi-tenant SaaS mode, read from the app-wide
 * health query cache (the shell owns the fetch, like `useCloudInstance`).
 * SaaS mode accepts individual media and document files only.
 */
export function useSaasMode(): boolean {
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    enabled: false,
  });

  return healthQuery.data?.saasMode === true;
}

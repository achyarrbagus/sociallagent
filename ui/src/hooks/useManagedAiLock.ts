import { useQuery } from "@tanstack/react-query";
import { getManagedGatewayStatus } from "../api/onboarding-managed-gateway";

/**
 * SaaS lock: when the instance runs the managed 9Router gateway, only an
 * instance admin chooses adapters, models and AI connections. Everyone else
 * sees them read-only. The server enforces the same rule.
 */
export function useManagedAiLock(companyId: string | null | undefined) {
  const status = useQuery({
    queryKey: ["onboarding", "managed-gateway", companyId],
    queryFn: () => getManagedGatewayStatus(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  return { locked: status.data?.enabled === true && !status.data.canManage, status: status.data };
}

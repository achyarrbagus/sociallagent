import { useQuery } from "@tanstack/react-query";
import { getManagedGatewayStatus } from "../api/onboarding-managed-gateway";

/**
 * SaaS lock: when the instance runs the managed 9Router gateway, models are
 * set centrally at Settings → AI models. Per-agent adapter, model and AI
 * connection controls are read-only for everyone, admins included; the
 * server rejects the same changes from anyone who is not an instance admin.
 */
export function useManagedAiLock(companyId: string | null | undefined) {
  const status = useQuery({
    queryKey: ["onboarding", "managed-gateway", companyId],
    queryFn: () => getManagedGatewayStatus(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  return { locked: status.data?.enabled === true, canManage: status.data?.canManage === true, status: status.data };
}

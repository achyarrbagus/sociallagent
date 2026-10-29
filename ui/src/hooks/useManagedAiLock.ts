import { useQuery } from "@tanstack/react-query";
import type { ManagedGatewayStatus } from "@paperclipai/shared";
import { api } from "../api/client";

export const managedAiStatusQueryKey = ["instance", "managed-ai", "status"] as const;

/**
 * SaaS lock: when the instance runs the managed 9Router gateway, models are
 * set centrally at Settings → AI models and company users get a simplified
 * product. The lock is instance-wide; it depends only on the server key and
 * on whether the caller is an instance admin. The server enforces the same
 * rules.
 *
 * `_companyId` is accepted for call-site compatibility and not used.
 */
export function useManagedAiLock(_companyId?: string | null) {
  const status = useQuery({
    queryKey: managedAiStatusQueryKey,
    queryFn: () => api.get<ManagedGatewayStatus>("/instance/managed-ai/status"),
    staleTime: 60_000,
    retry: false,
  });
  return { locked: status.data?.enabled === true, canManage: status.data?.canManage === true, status: status.data };
}

import type { ReactNode } from "react";
import { Navigate, useLocation } from "@/lib/router";
import { useManagedAiLock } from "../hooks/useManagedAiLock";

/**
 * Board pages a company user has no use for in SaaS mode. They are hidden
 * from navigation; this keeps a typed or bookmarked URL from reaching them.
 */
const SAAS_HIDDEN_PAGE = /^(?:\/[^/]+)?\/(status|status-cards|board-chat|cases|routines|goals|artifacts|workspaces|org|timeline|costs|activity\/(commentary|costs|budgets|runs))(\/|$)/;

export function isSaasHiddenPath(pathname: string) {
  return SAAS_HIDDEN_PAGE.test(pathname);
}

export function SaasRouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { locked, canManage } = useManagedAiLock();
  if (locked && !canManage && isSaasHiddenPath(location.pathname)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

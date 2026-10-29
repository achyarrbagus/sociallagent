import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";
import { useManagedAiLock } from "./useManagedAiLock";

/**
 * SaaS mode: settings a company user has no use for. Instance-level pages and
 * the company's technical plumbing stay with the instance admin.
 */
const SAAS_HIDDEN_SETTINGS = [
  "company.secrets",
  "company.connections",
  "company.import",
  "instance.environments",
  "instance.access",
  "instance.heartbeats",
  "instance.experimental",
  "instance.plugins",
  "instance.adapters",
] as const;

/**
 * Settings surfaces hidden by the hosting operator, from the app-wide health
 * query cache (keys from the shared settings-visibility registry, e.g.
 * "instance.plugins" or "instance.experimental.enableSmokeLab").
 * CloudAccessGate owns the fetch; this observer never issues its own request.
 *
 * `loaded` is false until the health response is in the cache — gates should
 * render nothing rather than flash a surface that may turn out to be hidden.
 */
export function useHiddenSettings(): { hidden: ReadonlySet<string>; loaded: boolean } {
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    enabled: false,
  });

  const { locked, canManage } = useManagedAiLock();
  const saasUser = locked && !canManage;

  const data = healthQuery.data;
  return useMemo(
    () => ({
      hidden: new Set([...(data?.hiddenSettings ?? []), ...(saasUser ? SAAS_HIDDEN_SETTINGS : [])]),
      loaded: data !== undefined,
    }),
    [data, saasUser],
  );
}

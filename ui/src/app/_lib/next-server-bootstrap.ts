import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { dehydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import {
  authSessionSchema,
  type AuthSession,
  type Company,
  type InstanceExperimentalSettingsWithManaged,
} from "@paperclipai/shared";
import type { HealthStatus } from "@/api/health";
import type { CurrentBoardAccess } from "@/api/access";
import type { CompanyListResult } from "@/api/companies-query";
import { queryKeys } from "@/lib/queryKeys";

export type CompanyShellBootstrap = {
  dehydratedState: DehydratedState | null;
  initialCompanyId: string | null;
};

type ApiResponse<T> = { status: number; data: T | null };

function configuredApiOrigin(): string | null {
  const configured = process.env.PAPERCLIP_INTERNAL_API_ORIGIN;
  if (!configured) return null;

  try {
    const parsed = new URL(configured);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseSession(value: unknown): AuthSession | null {
  const direct = authSessionSchema.safeParse(value);
  if (direct.success) return direct.data;
  if (!value || typeof value !== "object") return null;
  const nested = authSessionSchema.safeParse((value as Record<string, unknown>).data);
  return nested.success ? nested.data : null;
}

async function getApiJson<T>(origin: string, cookie: string | null, path: string): Promise<ApiResponse<T>> {
  const response = await fetch(new URL(path, `${origin}/`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as T | null;
  return { status: response.status, data };
}

function createRequestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}

const EMPTY_BOOTSTRAP: CompanyShellBootstrap = {
  dehydratedState: null,
  initialCompanyId: null,
};

export const getCompanyShellBootstrap = cache(async (companyPrefix: string): Promise<CompanyShellBootstrap> => {
  const origin = configuredApiOrigin();
  if (!origin) return EMPTY_BOOTSTRAP;

  const incomingHeaders = await headers();
  const cookie = incomingHeaders.get("cookie");
  const queryClient = createRequestQueryClient();

  try {
    const healthResponse = await getApiJson<HealthStatus>(origin, cookie, "/api/health");
    if (healthResponse.status !== 200 || !healthResponse.data) return EMPTY_BOOTSTRAP;
    queryClient.setQueryData(queryKeys.health, healthResponse.data);

    const sessionResponse = await getApiJson<unknown>(origin, cookie, "/api/auth/get-session");
    if (sessionResponse.status === 401) {
      queryClient.setQueryData(queryKeys.auth.session, null);
      if (healthResponse.data.deploymentMode === "authenticated") {
        return { dehydratedState: dehydrate(queryClient), initialCompanyId: null };
      }
    } else if (sessionResponse.status !== 200) {
      return { dehydratedState: dehydrate(queryClient), initialCompanyId: null };
    }

    const session = sessionResponse.status === 200 ? parseSession(sessionResponse.data) : null;
    queryClient.setQueryData(queryKeys.auth.session, session);

    if (healthResponse.data.deploymentMode === "authenticated") {
      if (!session) return { dehydratedState: dehydrate(queryClient), initialCompanyId: null };
      const accessResponse = await getApiJson<CurrentBoardAccess>(origin, cookie, "/api/cli-auth/me");
      if (accessResponse.status !== 200 || !accessResponse.data) {
        return { dehydratedState: dehydrate(queryClient), initialCompanyId: null };
      }
      queryClient.setQueryData(queryKeys.access.currentBoardAccess, accessResponse.data);
    }

    const [companiesResponse, experimentalResponse] = await Promise.all([
      getApiJson<Company[]>(origin, cookie, "/api/companies?scope=accessible"),
      getApiJson<InstanceExperimentalSettingsWithManaged>(origin, cookie, "/api/instance/settings/experimental"),
    ]);

    let initialCompanyId: string | null = null;
    if (companiesResponse.status === 200 && Array.isArray(companiesResponse.data)) {
      const companyList: CompanyListResult = { companies: companiesResponse.data, unauthorized: false };
      const userId = session?.user.id ?? null;
      queryClient.setQueryData(queryKeys.companies.list(userId), companyList);
      const requestedPrefix = companyPrefix.trim().toUpperCase();
      initialCompanyId = companyList.companies.find(
        (company) => company.issuePrefix.trim().toUpperCase() === requestedPrefix,
      )?.id ?? null;
    }

    if (experimentalResponse.status === 200 && experimentalResponse.data) {
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, experimentalResponse.data);
    } else {
      // The client hook intentionally fails open to the default streamlined shell
      // when this non-authoritative presentation setting cannot be read.
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, { enableStreamlinedUi: true });
    }

    return { dehydratedState: dehydrate(queryClient), initialCompanyId };
  } catch {
    // A failed SSR prefetch is not proof of authorization. The existing client
    // gates retry through the same Express API and remain fail-closed.
    return { dehydratedState: dehydrate(queryClient), initialCompanyId: null };
  }
});

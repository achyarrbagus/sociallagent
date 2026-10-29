import type { EnsureAgencyCoreTeamResult } from "@paperclipai/shared";
import { api } from "./client";

/** Installs the default agency team under the onboarding Agency Director. */
export function ensureAgencyTeam(companyId: string, agentId: string): Promise<EnsureAgencyCoreTeamResult> {
  return api.post<EnsureAgencyCoreTeamResult>(
    `/companies/${encodeURIComponent(companyId)}/onboarding/agency-team`,
    { agentId },
  );
}

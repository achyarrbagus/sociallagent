import type { CreditBalance, CreditSettings } from "@paperclipai/shared";
import { api } from "./client";
export const creditsApi = {
  balance: (companyId: string) => api.get<CreditBalance>(`/companies/${encodeURIComponent(companyId)}/credits`),
  settings: () => api.get<CreditSettings>("/instance/settings/credits"),
  updateSettings: (settings: CreditSettings) => api.put<CreditSettings>("/instance/settings/credits", settings),
  companySettings: (companyId: string) => api.get<CreditSettings & { override: boolean }>(`/instance/companies/${encodeURIComponent(companyId)}/credits`),
  resetCompany: (companyId: string) => api.delete<void>(`/instance/companies/${encodeURIComponent(companyId)}/credits`),
  setCompany: (companyId: string, settings: CreditSettings) => api.put<CreditSettings>(`/instance/companies/${encodeURIComponent(companyId)}/credits`, settings),
};

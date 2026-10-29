import type { AgencyBrand, AgencyClient, AgencyDirectory } from "@paperclipai/shared";
import { api } from "./client";

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/agency`;
export const agencyApi = {
  directory: (companyId: string) => api.get<AgencyDirectory>(base(companyId)),
  createClient: (companyId: string, data: Record<string, unknown>) => api.post<AgencyClient>(`${base(companyId)}/clients`, data),
  updateClient: (companyId: string, id: string, data: Record<string, unknown>) => api.patch<AgencyClient>(`${base(companyId)}/clients/${encodeURIComponent(id)}`, data),
  createBrand: (companyId: string, data: Record<string, unknown>) => api.post<AgencyBrand>(`${base(companyId)}/brands`, data),
  updateBrand: (companyId: string, id: string, data: Record<string, unknown>) => api.patch<AgencyBrand>(`${base(companyId)}/brands/${encodeURIComponent(id)}`, data),
};

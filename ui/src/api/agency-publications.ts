import type { AgencyPublication, CompleteAgencyPublication, CreateAgencyPublication } from "@paperclipai/shared";
import { api } from "./client";

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/agency/publications`;

/** Content calendar: scheduled, published, failed and cancelled posts. */
export const agencyPublicationsApi = {
  list: (companyId: string, range: { from: string; to: string; brandId?: string }) => {
    const params = new URLSearchParams({ from: range.from, to: range.to, ...(range.brandId ? { brandId: range.brandId } : {}) });
    return api.get<AgencyPublication[]>(`${base(companyId)}?${params}`);
  },
  create: (companyId: string, data: CreateAgencyPublication) => api.post<AgencyPublication>(base(companyId), data),
  cancel: (companyId: string, id: string) => api.post<AgencyPublication>(`${base(companyId)}/${encodeURIComponent(id)}/cancel`, {}),
  complete: (companyId: string, id: string, data: CompleteAgencyPublication) =>
    api.post<AgencyPublication>(`${base(companyId)}/${encodeURIComponent(id)}/complete`, data),
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", youtube: "YouTube", other: "Other",
};

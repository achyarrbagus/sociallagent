export interface AgencyClient {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgencyBrand {
  id: string;
  companyId: string;
  clientId: string;
  name: string;
  websiteUrl: string | null;
  audience: string | null;
  toneOfVoice: string | null;
  brief: string | null;
  timezone: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgencyDirectory {
  clients: AgencyClient[];
  brands: AgencyBrand[];
  canManage: boolean;
}

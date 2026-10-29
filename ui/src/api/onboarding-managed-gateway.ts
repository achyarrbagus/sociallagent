import type { EnsureManagedGatewayResult, ManagedGatewayAdapterType, ManagedGatewayStatus } from "@paperclipai/shared";
import { api } from "./client";

/** Whether the operator configured a 9Router gateway for every company. */
export function getManagedGatewayStatus(companyId: string): Promise<ManagedGatewayStatus> {
  return api.get<ManagedGatewayStatus>(
    `/companies/${encodeURIComponent(companyId)}/onboarding/managed-gateway`,
  );
}

/** Connects the company to the instance-managed 9Router gateway and returns its shared binding. */
export function ensureManagedGateway(
  companyId: string,
  adapterType: ManagedGatewayAdapterType,
): Promise<EnsureManagedGatewayResult> {
  return api.post<EnsureManagedGatewayResult>(
    `/companies/${encodeURIComponent(companyId)}/onboarding/managed-gateway`,
    { adapterType },
  );
}

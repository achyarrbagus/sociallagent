import type {
  ManagedAiAdminSettings,
  ManagedAiAgentRow,
  ManagedAiModelOption,
  ManagedAiModelPolicy,
  UpdateManagedAiModelsResult,
} from "@paperclipai/shared";
import { api } from "./client";

/** Instance-admin control of the managed 9Router gateway's models. */
export const managedAiApi = {
  getSettings: () => api.get<ManagedAiAdminSettings>("/instance/settings/ai-models"),
  updatePolicy: (policy: ManagedAiModelPolicy) =>
    api.put<UpdateManagedAiModelsResult>("/instance/settings/ai-models", policy),
  catalog: () => api.get<ManagedAiModelOption[]>("/instance/ai-models/catalog"),
  agents: () => api.get<ManagedAiAgentRow[]>("/instance/ai-models/agents"),
};

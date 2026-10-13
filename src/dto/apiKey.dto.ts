import type { CollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";

export interface CreateApiKeyDto {
  label: string;
  description?: string;
  ipAllowlist?: string[];
}

export interface UpdateApiKeyDto {
  label?: string;
  description?: string;
  ipAllowlist?: string[];
  enhancedRetrieval?: boolean;
}

export interface ApiKeyOutDto {
  id: string;
  label: string;
  description: string;
  prefix: string;
  ipAllowlist: string[];
  lastUsedAt: string | null;
  status: "active" | "disabled_plan" | "revoked";
  enhancedRetrieval: boolean;
  role: "owner" | "collaborator";
  permissions?: CollaboratorPermissions;
}

export interface CreateApiKeyOutDto extends ApiKeyOutDto {
  key: string;
}

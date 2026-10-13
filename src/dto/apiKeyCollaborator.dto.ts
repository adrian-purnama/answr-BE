import type { CollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";

export type { CollaboratorPermissions };

export interface CreateApiKeyCollaboratorDto {
  apiKeyId: string;
  userId: string;
  permissions: CollaboratorPermissions;
}

export interface UpdateApiKeyCollaboratorDto {
  permissions: CollaboratorPermissions;
}

export interface ApiKeyCollaboratorOutDto {
  id: string;
  apiKeyId: string;
  userId: string;
  email?: string | null;
  permissions: CollaboratorPermissions;
  createdAt: string;
  updatedAt: string;
}

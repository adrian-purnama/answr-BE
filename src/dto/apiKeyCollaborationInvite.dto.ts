import type { CollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";

export interface CreateApiKeyCollaborationInviteOutDto {
  id: string;
  apiKeyId: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  invitationUrl: string;
}

export type CollaborationInviteAcceptRole = "owner" | "collaborator";

export interface AcceptApiKeyCollaborationInviteOutDto {
  apiKeyId: string;
  label: string;
  role: CollaborationInviteAcceptRole;
  alreadyMember: boolean;
  permissions: CollaboratorPermissions | null;
}

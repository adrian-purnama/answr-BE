import type { Types } from "mongoose";

export interface ApiKeyCollaborationInviteInterface {
  apiKeyId: Types.ObjectId;
  createdBy: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

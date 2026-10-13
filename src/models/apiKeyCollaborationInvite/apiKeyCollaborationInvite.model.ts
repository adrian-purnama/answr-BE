import { model, Schema } from "mongoose";
import type { ApiKeyCollaborationInviteInterface } from "./apiKeyCollaborationInvite.interface";

const apiKeyCollaborationInviteSchema =
  new Schema<ApiKeyCollaborationInviteInterface>(
    {
      apiKeyId: {
        type: Schema.Types.ObjectId,
        ref: "ApiKey",
        required: true,
      },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      tokenHash: {
        type: String,
        required: true,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
      usedAt: {
        type: Date,
        default: null,
      },
      usedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    { timestamps: true },
  );

apiKeyCollaborationInviteSchema.index({ tokenHash: 1 }, { unique: true });
apiKeyCollaborationInviteSchema.index({ apiKeyId: 1 });

export const ApiKeyCollaborationInviteModel =
  model<ApiKeyCollaborationInviteInterface>(
    "ApiKeyCollaborationInvite",
    apiKeyCollaborationInviteSchema,
  );

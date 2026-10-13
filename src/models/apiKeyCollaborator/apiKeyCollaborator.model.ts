import { model, Schema } from "mongoose";
import type { ApiKeyCollaboratorInterface } from "./apiKeyCollaborator.interface";

const collaboratorPermissionsSchema = new Schema(
  {
    overview: { type: Boolean, required: true },
    performance: { type: Boolean, required: true },
    gaps: { type: Boolean, required: true },
    train: {
      articleSnippet: { type: Boolean, required: true },
      guidance: { type: Boolean, required: true },
    },
    test: { type: Boolean, required: true },
    tools: {
      liveAgent: { type: Boolean, required: true },
      meeting: { type: Boolean, required: true },
      mcp: { type: Boolean, required: true },
      leadCapture: { type: Boolean, required: true },
      whatsApp: { type: Boolean, required: true },
    },
    widget: { type: Boolean, required: true },
  },
  { _id: false },
);

const apiKeyCollaboratorSchema = new Schema<ApiKeyCollaboratorInterface>(
  {
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    permissions: {
      type: collaboratorPermissionsSchema,
      required: true,
    },
  },
  { timestamps: true },
);

apiKeyCollaboratorSchema.index({ apiKeyId: 1, userId: 1 }, { unique: true });

export const ApiKeyCollaboratorModel = model<ApiKeyCollaboratorInterface>(
  "ApiKeyCollaborator",
  apiKeyCollaboratorSchema,
);

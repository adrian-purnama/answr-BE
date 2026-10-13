import { model, Schema } from "mongoose";
import type { LiveAgentInterface } from "./liveAgent.interface";

const liveAgentSchema = new Schema<LiveAgentInterface>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    profilePicture: {
      type: String,
      required: false,
      default: "",
    },
    hashedPassword: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

liveAgentSchema.index({ userId: 1, apiKeyId: 1 });
liveAgentSchema.index({ apiKeyId: 1, name: 1 }, { unique: true });

export const LiveAgentModel = model<LiveAgentInterface>(
  "LiveAgent",
  liveAgentSchema,
);

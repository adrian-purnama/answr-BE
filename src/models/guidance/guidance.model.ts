import { model, Schema } from "mongoose";
import type { GuidanceInterface } from "./guidance.interface";

export const GUIDANCE_TITLE_MAX = 200;

const guidanceSchema = new Schema<GuidanceInterface>(
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
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: GUIDANCE_TITLE_MAX,
    },
    content: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

guidanceSchema.index({ userId: 1, apiKeyId: 1 });

export const GuidanceModel = model<GuidanceInterface>(
  "Guidance",
  guidanceSchema,
);

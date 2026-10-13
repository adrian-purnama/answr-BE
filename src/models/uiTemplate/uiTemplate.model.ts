import { model, Schema } from "mongoose";
import type { UiTemplateInterface } from "./uiTemplate.interface";

export const UI_TEMPLATE_NAME_MAX = 120;

const uiTemplateSchema = new Schema<UiTemplateInterface>(
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
      maxlength: UI_TEMPLATE_NAME_MAX,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    definition: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

uiTemplateSchema.index({ apiKeyId: 1, name: 1 }, { unique: true });
uiTemplateSchema.index({ userId: 1, apiKeyId: 1 });

export const UiTemplateModel = model<UiTemplateInterface>(
  "UiTemplate",
  uiTemplateSchema,
);

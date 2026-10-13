import { model, Schema, Types } from "mongoose";
import {
  WIDGET_AI_FEEDBACK_TRIGGERS,
  type WidgetAiFeedbackInterface,
} from "./widgetAiFeedback.interface";

const widgetAiFeedbackSchema = new Schema<WidgetAiFeedbackInterface>(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      required: true,
      index: true,
    },
    publicKey: {
      type: String,
      required: true,
      trim: true,
    },
    chatSessionId: {
      type: Types.ObjectId,
      required: true,
      unique: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    trigger: {
      type: String,
      enum: WIDGET_AI_FEEDBACK_TRIGGERS,
      required: true,
    },
  },
  { timestamps: true },
);

widgetAiFeedbackSchema.index({ userId: 1, apiKeyId: 1, createdAt: -1 });

export const WidgetAiFeedbackModel = model<WidgetAiFeedbackInterface>(
  "WidgetAiFeedback",
  widgetAiFeedbackSchema,
);

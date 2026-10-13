import { model, Schema, Types } from "mongoose";
import type { WidgetUsageDailyInterface } from "./widgetUsageDaily.interface";

const widgetUsageDailySchema = new Schema<WidgetUsageDailyInterface>(
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
    },
    date: {
      type: Date,
      required: true,
    },
    visits: { type: Number, required: true, default: 0, min: 0 },
    chatUsed: { type: Number, required: true, default: 0, min: 0 },
    faqViews: { type: Number, required: true, default: 0, min: 0 },
    newsViews: { type: Number, required: true, default: 0, min: 0 },
    byFaqArticleId: { type: Map, of: Number, default: () => new Map() },
    byNewsId: { type: Map, of: Number, default: () => new Map() },
  },
  { timestamps: true },
);

widgetUsageDailySchema.index(
  { userId: 1, apiKeyId: 1, date: 1 },
  { unique: true },
);
widgetUsageDailySchema.index({ userId: 1, apiKeyId: 1, date: -1 });

export const WidgetUsageDailyModel = model<WidgetUsageDailyInterface>(
  "WidgetUsageDaily",
  widgetUsageDailySchema,
);

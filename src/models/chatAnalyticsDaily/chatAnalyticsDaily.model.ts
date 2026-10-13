import { model, Schema, Types } from "mongoose";
import type { ChatAnalyticsDailyInterface } from "./chatAnalyticsDaily.interface";

const chatAnalyticsDailySchema = new Schema<ChatAnalyticsDailyInterface>(
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
    totalMessages: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    answerableCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    unanswerableCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    gapCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    byType: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    byCategoryId: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    byGapType: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

chatAnalyticsDailySchema.index(
  { userId: 1, apiKeyId: 1, date: 1 },
  { unique: true },
);
chatAnalyticsDailySchema.index({ userId: 1, apiKeyId: 1, date: -1 });

export const ChatAnalyticsDailyModel = model<ChatAnalyticsDailyInterface>(
  "ChatAnalyticsDaily",
  chatAnalyticsDailySchema,
);

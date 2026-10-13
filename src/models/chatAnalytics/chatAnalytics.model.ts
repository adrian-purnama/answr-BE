import { model, Schema, Types } from "mongoose";
import { MESSAGE_ROLES } from "../message/message.interface";
import type { ChatAnalyticsInterface } from "./chatAnalytics.interface";

const chatAnalyticsSchema = new Schema<ChatAnalyticsInterface>(
  {
    chatMessageId: {
      type: Types.ObjectId,
      ref: "ChatMessage",
      required: true,
      unique: true,
    },
    chatSessionId: {
      type: Types.ObjectId,
      ref: "ChatSession",
      required: true,
      index: true,
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      required: true,
      index: true,
    },
    categoryId: {
      type: Types.ObjectId,
      ref: "AnalyticsCategory",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    intent: {
      type: String,
      trim: true,
    },
    answerable: {
      type: Boolean,
      default: null,
      index: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    gapDetected: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    gapType: {
      type: String,
    },
    gapReason: {
      type: String,
      trim: true,
    },
    gapResolved: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    gapResolvedAt: {
      type: Date,
    },
    gapResolvedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    messageRole: {
      type: String,
      enum: MESSAGE_ROLES,
      required: true,
    },
    messageCreatedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

chatAnalyticsSchema.index({ userId: 1, apiKeyId: 1, messageCreatedAt: -1 });
chatAnalyticsSchema.index({
  userId: 1,
  apiKeyId: 1,
  categoryId: 1,
  messageCreatedAt: -1,
});
chatAnalyticsSchema.index({
  userId: 1,
  apiKeyId: 1,
  type: 1,
  messageCreatedAt: -1,
});
chatAnalyticsSchema.index({
  userId: 1,
  apiKeyId: 1,
  answerable: 1,
  messageCreatedAt: -1,
});
chatAnalyticsSchema.index({
  userId: 1,
  apiKeyId: 1,
  gapDetected: 1,
  gapResolved: 1,
  gapType: 1,
  messageCreatedAt: -1,
});
chatAnalyticsSchema.index({ chatSessionId: 1, messageCreatedAt: -1 });

export const ChatAnalyticsModel = model<ChatAnalyticsInterface>(
  "ChatAnalytics",
  chatAnalyticsSchema,
);

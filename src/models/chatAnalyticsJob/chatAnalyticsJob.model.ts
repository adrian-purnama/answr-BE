import { model, Schema, Types } from "mongoose";
import { AGENT_EXECUTION_MODES } from "../message/messageAnalytics.types";
import {
  CHAT_ANALYTICS_JOB_STATUS_VALUES,
  type ChatAnalyticsJobInterface,
} from "./chatAnalyticsJob.interface";

const chatAnalyticsJobToolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    ok: { type: Boolean, required: true },
  },
  { _id: false },
);

const chatAnalyticsJobSchema = new Schema<ChatAnalyticsJobInterface>(
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
    assistantMessageId: {
      type: Types.ObjectId,
      ref: "ChatMessage",
      required: false,
    },
    tools: {
      type: [chatAnalyticsJobToolSchema],
      required: false,
    },
    executionMode: {
      type: String,
      enum: AGENT_EXECUTION_MODES,
      required: true,
      default: "real",
    },
    jobStatus: {
      type: String,
      enum: CHAT_ANALYTICS_JOB_STATUS_VALUES,
      required: true,
      default: "pending",
    },
    jobAttempts: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    jobClaimedAt: {
      type: Date,
      required: false,
      default: null,
    },
    jobNextAt: {
      type: Date,
      required: false,
      default: null,
    },
    jobLastError: {
      type: String,
      required: true,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

chatAnalyticsJobSchema.index({ jobStatus: 1, jobNextAt: 1 });

export const ChatAnalyticsJobModel = model<ChatAnalyticsJobInterface>(
  "ChatAnalyticsJob",
  chatAnalyticsJobSchema,
);

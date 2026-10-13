import { Schema, model } from "mongoose";
import {
  LEAD_STATUS_VALUES,
  LEAD_SUMMARY_JOB_STATUS_VALUES,
  type LeadInterface,
} from "./leadCapture.interface";

const leadFieldValueSchema = new Schema(
  {
    fieldId: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const leadSchema = new Schema<LeadInterface>(
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
      index: true,
    },
    chatSessionId: {
      type: Schema.Types.ObjectId,
      ref: "ChatSession",
      required: true,
    },
    status: {
      type: String,
      enum: LEAD_STATUS_VALUES,
      required: true,
      default: "gathering",
    },
    fieldValues: {
      type: [leadFieldValueSchema],
      required: true,
      default: [],
    },
    summary: {
      type: String,
      required: true,
      default: "",
      trim: true,
    },
    summaryJobStatus: {
      type: String,
      enum: LEAD_SUMMARY_JOB_STATUS_VALUES,
      required: true,
      default: "none",
    },
    summaryJobAttempts: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    summaryJobClaimedAt: {
      type: Date,
      required: false,
      default: null,
    },
    summaryJobNextAt: {
      type: Date,
      required: false,
      default: null,
    },
    summaryJobLastError: {
      type: String,
      required: true,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

/** MongoDB removes the lead this long after createdAt. */
export const LEAD_TTL_SECONDS = 30 * 24 * 60 * 60;

leadSchema.index({ apiKeyId: 1, chatSessionId: 1 }, { unique: true });
leadSchema.index({ apiKeyId: 1, updatedAt: -1 });
leadSchema.index({ createdAt: 1 }, { expireAfterSeconds: LEAD_TTL_SECONDS });
leadSchema.index({ summaryJobStatus: 1, summaryJobNextAt: 1 });

export const LeadModel = model<LeadInterface>("Lead", leadSchema);

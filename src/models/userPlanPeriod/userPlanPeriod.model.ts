import { model, Schema, Types } from "mongoose";
import {
  DEEPSEEK_TOKEN_ADJUSTMENT_SOURCES,
  PLAN_PERIOD_SOURCES,
  type UserPlanPeriodInterface,
} from "./userPlanPeriod.interface";

const deepseekUsageSchema = new Schema(
  {
    windowIndex: { type: Number, required: true, min: 0, default: 0 },
    inputTokens: { type: Number, required: true, min: 0, default: 0 },
    outputTokens: { type: Number, required: true, min: 0, default: 0 },
    totalTokens: { type: Number, required: true, min: 0, default: 0 },
    lastUpdatedAt: { type: Date, required: false },
  },
  { _id: false },
);

const deepseekTokenAdjustmentSchema = new Schema(
  {
    requestedAmount: { type: Number, required: true },
    appliedAmount: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: DEEPSEEK_TOKEN_ADJUSTMENT_SOURCES,
      required: true,
    },
    invoiceId: {
      type: Types.ObjectId,
      ref: "Invoice",
      required: false,
      default: null,
    },
    adminUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const userPlanPeriodSchema = new Schema<UserPlanPeriodInterface>(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    planId: {
      type: Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
    },
    untilDate: {
      type: Date,
      required: true,
    },
    source: {
      type: String,
      enum: PLAN_PERIOD_SOURCES,
      required: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    /** Per-window token limit for this period (not the whole period total). */
    deepseekQuotaPerPeriod: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    quotaWindowDays: {
      type: Number,
      required: false,
      default: null,
      validate: {
        validator: (v: unknown) =>
          v == null ||
          (typeof v === "number" && Number.isFinite(v) && v >= 1),
        message: "quotaWindowDays must be null or a number >= 1",
      },
    },
    deepseekUsage: {
      type: deepseekUsageSchema,
      required: true,
      default: () => ({
        windowIndex: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      }),
    },
    deepseekTokenAdjustments: {
      type: [deepseekTokenAdjustmentSchema],
      required: true,
      default: () => [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

userPlanPeriodSchema.index({ userId: 1, effectiveDate: 1 }, { unique: true });
userPlanPeriodSchema.index({ userId: 1, untilDate: 1 });

export const UserPlanPeriodModel = model<UserPlanPeriodInterface>(
  "UserPlanPeriod",
  userPlanPeriodSchema,
);

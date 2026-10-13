import { model, Schema, Types } from "mongoose";
import {
  ANALYTICS_OPTION_DIMENSIONS,
  type AnalyticsCategoryInterface,
} from "./analyticsCategory.interface";

const analyticsCategorySchema = new Schema<AnalyticsCategoryInterface>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dimension: {
      type: String,
      enum: ANALYTICS_OPTION_DIMENSIONS,
      required: true,
      default: "category",
    },
    isSystem: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

analyticsCategorySchema.index(
  { isSystem: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { isSystem: true },
  },
);
analyticsCategorySchema.index(
  { apiKeyId: 1, dimension: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { isSystem: false, apiKeyId: { $type: "objectId" } },
  },
);
analyticsCategorySchema.index({ userId: 1, apiKeyId: 1, isActive: 1 });

export const AnalyticsCategoryModel = model<AnalyticsCategoryInterface>(
  "AnalyticsCategory",
  analyticsCategorySchema,
);

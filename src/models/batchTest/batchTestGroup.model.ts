import { Schema, model } from "mongoose";
import {
  BATCH_TEST_GROUP_RUN_STATUS_VALUES,
  type BatchTestGroupInterface,
} from "./batchTestGroup.interface";

const BatchTestGroupSchema = new Schema<BatchTestGroupInterface>(
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
    },
    runStatus: {
      type: String,
      enum: BATCH_TEST_GROUP_RUN_STATUS_VALUES,
      required: true,
      default: "idle",
    },
    progress: {
      total: { type: Number, required: true, min: 0, default: 0 },
      completed: { type: Number, required: true, min: 0, default: 0 },
      failed: { type: Number, required: true, min: 0, default: 0 },
    },
    lastRunAt: {
      type: Date,
      required: false,
      default: null,
    },
    latestRunId: {
      type: String,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

BatchTestGroupSchema.index({ userId: 1, apiKeyId: 1 });
BatchTestGroupSchema.index({ userId: 1, apiKeyId: 1, updatedAt: -1 });

export const BatchTestGroupModel = model<BatchTestGroupInterface>(
  "BatchTestGroup",
  BatchTestGroupSchema,
);

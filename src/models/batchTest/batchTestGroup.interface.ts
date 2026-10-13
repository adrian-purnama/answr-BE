import type { Types } from "mongoose";

export const BATCH_TEST_GROUP_RUN_STATUS_VALUES = [
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export type BatchTestGroupRunStatus =
  (typeof BATCH_TEST_GROUP_RUN_STATUS_VALUES)[number];

export type BatchTestGroupProgress = {
  total: number;
  completed: number;
  failed: number;
};

export interface BatchTestGroupInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  name: string;
  runStatus: BatchTestGroupRunStatus;
  progress: BatchTestGroupProgress;
  lastRunAt: Date | null;
  latestRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

import type { Types } from "mongoose";
import type { AgentExecutionMode } from "../message/messageAnalytics.types";

export const CHAT_ANALYTICS_JOB_STATUS_VALUES = [
  "pending",
  "running",
  "done",
  "failed",
] as const;

export type ChatAnalyticsJobStatus =
  (typeof CHAT_ANALYTICS_JOB_STATUS_VALUES)[number];

export type ChatAnalyticsJobToolOutcome = {
  name: string;
  ok: boolean;
};

export interface ChatAnalyticsJobInterface {
  _id: Types.ObjectId;
  chatMessageId: Types.ObjectId;
  chatSessionId: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  assistantMessageId?: Types.ObjectId;
  tools?: ChatAnalyticsJobToolOutcome[];
  executionMode: AgentExecutionMode;
  jobStatus: ChatAnalyticsJobStatus;
  jobAttempts: number;
  jobClaimedAt: Date | null;
  jobNextAt: Date | null;
  jobLastError: string;
  createdAt: Date;
  updatedAt: Date;
}

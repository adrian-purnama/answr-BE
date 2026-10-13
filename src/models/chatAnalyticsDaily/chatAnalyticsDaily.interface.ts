import type { Types } from "mongoose";

export interface ChatAnalyticsDailyInterface {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** UTC midnight for the day. */
  date: Date;
  totalMessages: number;
  answerableCount: number;
  unanswerableCount: number;
  gapCount: number;
  byType: Map<string, number> | Record<string, number>;
  byCategoryId: Map<string, number> | Record<string, number>;
  byGapType: Map<string, number> | Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

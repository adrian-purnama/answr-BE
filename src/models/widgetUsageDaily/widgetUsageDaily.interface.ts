import type { Types } from "mongoose";

export interface WidgetUsageDailyInterface {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** UTC midnight for the day. */
  date: Date;
  visits: number;
  chatUsed: number;
  faqViews: number;
  newsViews: number;
  byFaqArticleId: Map<string, number> | Record<string, number>;
  byNewsId: Map<string, number> | Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

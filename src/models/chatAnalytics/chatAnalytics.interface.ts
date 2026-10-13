import type { Types } from "mongoose";
import type {
  AnalyticsGapType,
  MessageAnalyticsType,
} from "../message/messageAnalytics.types";
import type { MessageRole } from "../message/message.interface";

export interface ChatAnalyticsInterface {
  _id: Types.ObjectId;
  chatMessageId: Types.ObjectId;
  chatSessionId: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  categoryId: Types.ObjectId;
  type: MessageAnalyticsType;
  intent?: string;
  answerable: boolean | null;
  confidence: number;
  gapDetected: boolean;
  gapType?: AnalyticsGapType;
  gapReason?: string;
  gapResolved: boolean;
  gapResolvedAt?: Date;
  gapResolvedBy?: Types.ObjectId;
  messageRole: MessageRole;
  messageCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

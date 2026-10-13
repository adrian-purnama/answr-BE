import type { AnalyticsOptionDimension } from "../models/analyticsCategory/analyticsCategory.interface";
import type {
  AnalyticsGapType,
  MessageAnalyticsType,
} from "../models/message/messageAnalytics.types";

export type AnalyticsCategoryOutDto = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  dimension: AnalyticsOptionDimension;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnalyticsCategoryDto = {
  apiKeyId: string;
  name: string;
  slug?: string;
  /** Trigger condition: when this option should be chosen. */
  description: string;
  dimension?: AnalyticsOptionDimension;
};

export type UpdateAnalyticsCategoryDto = {
  name?: string;
  description?: string;
  isActive?: boolean;
};

export type ChatAnalyticsRecordOutDto = {
  id: string;
  chatMessageId: string;
  chatSessionId: string;
  conversationId: string;
  userId: string;
  apiKeyId: string;
  categoryId: string;
  categoryName?: string;
  type: MessageAnalyticsType;
  intent?: string;
  answerable: boolean | null;
  confidence: number;
  gapDetected: boolean;
  gapType?: AnalyticsGapType;
  gapReason?: string;
  gapResolved: boolean;
  gapResolvedAt?: string;
  messageRole: string;
  messageCreatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatAnalyticsSummaryOutDto = {
  from: string;
  to: string;
  lookbackDays: number;
  totalMessages: number;
  answerableCount: number;
  unanswerableCount: number;
  /** Open (unresolved) gaps in range. */
  gapCount: number;
  resolvedGapCount: number;
  byType: Record<string, number>;
  byCategoryId: Record<string, number>;
  byGapType: Record<string, number>;
};

export type ChatAnalyticsRecordsPageOutDto = {
  items: ChatAnalyticsRecordOutDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type ChatAnalyticsConversationMessageOutDto = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  analysis?: {
    categoryId?: string;
    type: string;
    intent?: string;
    answerable: boolean | null;
    confidence: number;
    gapDetected: boolean;
    gapType?: string;
    gapReason?: string;
    gapResolved?: boolean;
  } | null;
};

export type ChatAnalyticsConversationOutDto = {
  chatSessionId: string;
  conversationId: string;
  messages: ChatAnalyticsConversationMessageOutDto[];
};

export type ChatAnalyticsTrendSeriesOutDto = {
  key: string;
  label: string;
  total: number;
  /** Share of all messages in range (0–100). */
  sharePercent: number;
  points: number[];
};

export type ChatAnalyticsTrendsOutDto = {
  from: string;
  to: string;
  lookbackDays: number;
  dimension: "category" | "gapType" | "type";
  dates: string[];
  totalMessages: number;
  series: ChatAnalyticsTrendSeriesOutDto[];
};

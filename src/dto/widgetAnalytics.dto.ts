export type WidgetVisitOutDto = {
  counted: boolean;
};

export type SubmitWidgetAiFeedbackDto = {
  stars: number;
  feedback?: string;
  trigger: "resolved" | "session_end";
};

export type WidgetAiFeedbackOutDto = {
  chatSessionId: string;
  stars: number;
  submitted: true;
};

export type WidgetUsageNamedCountDto = {
  id: string;
  label: string;
  count: number;
};

export type WidgetCsatCommentDto = {
  stars: number;
  feedback: string;
  agentName?: string;
  submittedAt: string;
};

export type WidgetCsatSummaryDto = {
  averageStars: number | null;
  ratingCount: number;
  recent: WidgetCsatCommentDto[];
  byAgent: Array<{ name: string; averageStars: number; ratingCount: number }>;
};

export type WidgetAnalyticsSummaryOutDto = {
  from: string;
  to: string;
  lookbackDays: number;
  visits: number;
  chatUsed: number;
  involvementRate: number;
  faqViews: number;
  newsViews: number;
  aiResolvedCount: number;
  liveAgentRoutedCount: number;
  topFaq: WidgetUsageNamedCountDto[];
  topNews: WidgetUsageNamedCountDto[];
  aiAgent: WidgetCsatSummaryDto;
  liveAgent: WidgetCsatSummaryDto;
};

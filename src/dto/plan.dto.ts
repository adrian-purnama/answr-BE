export interface CreatePlanDto {
  slug: string;
  name: string;
  description: string;
  pricePerMonth: number;
  priceLabel: number;
  priceNote: string;
  maxApiKeys: number;
  maxRequestsPerMinute: number;
  maxArticles: number;
  maxTopicsPerArticle: number;
  maxImagesPerTopic: number;
  maxCharactersPerTopic: number;
  maxSnippets: number;
  maxImagesPerSnippet: number;
  maxCharactersPerSnippet: number;
  maxGuidances: number;
  maxCharactersPerGuidance: number;
  maxLiveAgents: number;
  liveAgent: boolean;
  meetingTool: boolean;
  leadCapture: boolean;
  whatsApp: boolean;
  maxMeetingTopics: number;
  batchTestGroupAmount: number;
  questionsPerBatchTestGroup: number;
  analyticsLookbackDays: number;
  deepseekQuotaPerPeriod: number;
  /** null = whole plan period is one quota window. */
  quotaWindowDays: number | null;
  accentColor: string;
  order: number;
  showOnPricingPage: boolean;
  isDefaultPlan: boolean;
  isActive: boolean;
}

export type UpdatePlanDto = Partial<CreatePlanDto>;

export interface PlanOutDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricePerMonth: number;
  priceLabel: number;
  priceNote: string;
  maxApiKeys: number;
  maxRequestsPerMinute: number;
  maxArticles: number;
  maxTopicsPerArticle: number;
  maxImagesPerTopic: number;
  maxCharactersPerTopic: number;
  maxSnippets: number;
  maxImagesPerSnippet: number;
  maxCharactersPerSnippet: number;
  maxGuidances: number;
  maxCharactersPerGuidance: number;
  maxLiveAgents: number;
  liveAgent: boolean;
  meetingTool: boolean;
  leadCapture: boolean;
  whatsApp: boolean;
  maxMeetingTopics: number;
  batchTestGroupAmount: number;
  questionsPerBatchTestGroup: number;
  analyticsLookbackDays: number;
  deepseekQuotaPerPeriod: number;
  quotaWindowDays: number | null;
  accentColor: string;
  order: number;
  showOnPricingPage: boolean;
  isDefaultPlan: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

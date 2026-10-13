import type { UserPlanTimelineOutDto } from "./userPlanPeriod.dto";

export interface UserPlanOutDto {
  id: string;
  name: string;
  slug: string;
  accentColor: string;
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
  isDefaultPlan: boolean;
}

export interface UserPlanNextPeriodOutDto {
  planId: string;
  planName: string | null;
  effectiveDate: string;
  untilDate: string;
  neverExpires: boolean;
}

export interface UserPlanStatusOutDto {
  plan: UserPlanOutDto;
  planExpiresAt: string | null;
  neverExpires: boolean;
  timeline: UserPlanTimelineOutDto;
  nextPeriod: UserPlanNextPeriodOutDto | null;
}

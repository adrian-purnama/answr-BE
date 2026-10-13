export type PlanPeriodSourceDto = "manual" | "default_sync";

export type DeepseekTokenAdjustmentSourceDto = "admin" | "invoice";

export interface DeepseekTokenAdjustmentOutDto {
  requestedAmount: number;
  appliedAmount: number;
  reason: string;
  source: DeepseekTokenAdjustmentSourceDto;
  invoiceId: string | null;
  adminUserId: string | null;
  createdAt: string;
}

export interface UserPlanPeriodOutDto {
  id: string;
  userId: string;
  planId: string;
  planName: string | null;
  effectiveDate: string;
  untilDate: string;
  neverExpires: boolean;
  source: PlanPeriodSourceDto;
  createdAt: string | null;
  createdBy: string | null;
  /** Per-window DeepSeek token limit snapshotted on this period. */
  deepseekQuotaPerPeriod: number;
  quotaWindowDays: number | null;
  /** How many quota windows this period spans (null when open-ended). */
  windowCount: number | null;
  deepseekTokenAdjustments: DeepseekTokenAdjustmentOutDto[];
}

export interface PlanPeriodGapOutDto {
  effectiveDate: string;
  untilDate: string;
}

export interface UserPlanTimelineOutDto {
  periods: UserPlanPeriodOutDto[];
  gaps: PlanPeriodGapOutDto[];
  currentPeriodId: string | null;
  page: number;
  pageSize: number;
  total: number;
  /** Periods with untilDate <= now. */
  previousCount: number;
  /** Periods with effectiveDate > now. */
  upcomingCount: number;
  /** 1-based page (oldest-first) containing the active period; null if none. */
  currentPeriodPage: number | null;
  /** Newest period by effectiveDate (for "after last" add-period UX). */
  latestPeriod: Pick<
    UserPlanPeriodOutDto,
    "id" | "planName" | "untilDate" | "neverExpires"
  > | null;
  /** Non-ended periods for admin pickers (e.g. token top-up target). */
  openPeriods: Array<
    Pick<
      UserPlanPeriodOutDto,
      "id" | "planId" | "planName" | "effectiveDate" | "untilDate" | "neverExpires"
    > & { isCurrent: boolean }
  >;
}

export type PlanPeriodEffectiveModeDto = "now" | "absolute";

export interface PlanPeriodInputDto {
  planId: string;
  /**
   * Required when effectiveMode is "absolute" (default).
   * Ignored when effectiveMode is "now" (server sets effectiveDate).
   */
  effectiveDate?: string;
  untilDate: string;
  /** "now" = server clock inside the mutation; "absolute" = use effectiveDate. */
  effectiveMode?: PlanPeriodEffectiveModeDto;
}

export interface AddPlanPeriodsDto {
  periods: PlanPeriodInputDto[];
  preserveRemainder?: boolean;
}

export interface PlanPeriodRemainderOutDto {
  planId: string;
  planName: string | null;
  effectiveDate: string;
  untilDate: string;
}

export interface PlanPeriodsPreviewOutDto {
  wouldTruncate: boolean;
  remainder: PlanPeriodRemainderOutDto | null;
  wouldCreateGaps: PlanPeriodGapOutDto[];
  normalizedPeriods: Array<{
    planId: string;
    effectiveDate: string;
    untilDate: string;
    effectiveMode?: PlanPeriodEffectiveModeDto;
  }>;
  /** True when truncating a period that already has invoice/admin token adjustments. */
  truncatedPeriodHadTokenAdjustments: boolean;
}

export interface AddPlanPeriodsResultOutDto {
  periods: UserPlanPeriodOutDto[];
  truncatedPeriodId: string | null;
  remainderCreated: boolean;
  timeline: UserPlanTimelineOutDto;
  truncatedPeriodHadTokenAdjustments: boolean;
}

export interface AdjustPeriodTokensDto {
  amount: number;
  reason: string;
}

export interface CurrentPeriodQuotaOutDto {
  periodId: string;
  planId: string;
  planName: string | null;
  deepseekQuotaPerPeriod: number;
  quotaWindowDays: number | null;
  windowCount: number | null;
  deepseekWindow: {
    windowIndex: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    windowStart: string | null;
    windowEnd: string | null;
  } | null;
  deepseekTokenAdjustments: DeepseekTokenAdjustmentOutDto[];
}

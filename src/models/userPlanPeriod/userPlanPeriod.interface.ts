import { Types } from "mongoose";

export const PLAN_PERIOD_SOURCES = ["manual", "default_sync"] as const;
export type PlanPeriodSource = (typeof PLAN_PERIOD_SOURCES)[number];

export const DEEPSEEK_TOKEN_ADJUSTMENT_SOURCES = ["admin", "invoice"] as const;
export type DeepseekTokenAdjustmentSource =
  (typeof DEEPSEEK_TOKEN_ADJUSTMENT_SOURCES)[number];

/** Exclusive untilDate at/after this means "never ends". */
export const PLAN_NEVER_UNTIL = new Date("9999-01-01T00:00:00.000Z");

export function isNeverUntil(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date.getTime() >= PLAN_NEVER_UNTIL.getTime();
}

/** Live DeepSeek counters for the current quota window on this period. */
export interface DeepseekPeriodUsage {
  windowIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastUpdatedAt?: Date;
}

/** Audit entry when deepseekQuotaPerPeriod is changed after create. */
export interface DeepseekTokenAdjustment {
  requestedAmount: number;
  appliedAmount: number;
  reason: string;
  source: DeepseekTokenAdjustmentSource;
  invoiceId?: Types.ObjectId | null;
  adminUserId?: Types.ObjectId | null;
  createdAt: Date;
}

export interface UserPlanPeriodInterface {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  /** UTC inclusive start. */
  effectiveDate: Date;
  /** UTC exclusive end. */
  untilDate: Date;
  source: PlanPeriodSource;
  createdBy?: Types.ObjectId | null;
  /**
   * Per-window DeepSeek token limit for this period (snapshotted from Plan at
   * create; later admin/invoice adjustments change this field only).
   */
  deepseekQuotaPerPeriod: number;
  /** Snapshotted from Plan at create. null = whole period is one window. */
  quotaWindowDays: number | null;
  deepseekUsage?: DeepseekPeriodUsage;
  deepseekTokenAdjustments?: DeepseekTokenAdjustment[];
  createdAt?: Date;
  updatedAt?: Date;
}

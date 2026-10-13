import { Types } from "mongoose";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import type { DeepseekPeriodUsage } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { UserPlanPeriodModel } from "../../models/userPlanPeriod/userPlanPeriod.model";
import { userPlanPeriodService } from "../../modules/userPlanPeriod/userPlanPeriod.service";
import { getQuotaWindow, type QuotaWindow } from "./getQuotaWindow";
import { canUseDeepseek, usedInWindow } from "./deepseekQuotaHelpers";

export { canUseDeepseek, usedInWindow } from "./deepseekQuotaHelpers";

const logSource = "llm/deepseek/deepseekQuota.ts";

export type DeepseekTokenDelta = {
  inputTokens: number;
  outputTokens: number;
};

export type DeepseekQuotaSnapshot = {
  periodId: Types.ObjectId;
  quota: number;
  used: number;
  window: QuotaWindow;
  remaining: number;
};

function truncNonNeg(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.trunc(value);
}

function truncQuota(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.trunc(value);
}

async function loadQuotaContext(
  userId: Types.ObjectId,
  now: Date,
): Promise<{
  periodId: Types.ObjectId;
  quota: number;
  used: number;
  window: QuotaWindow;
} | null> {
  const period = await userPlanPeriodService.findPeriodContainingNow(userId, now);
  if (!period) return null;

  const window = getQuotaWindow(
    { effectiveDate: period.effectiveDate, untilDate: period.untilDate },
    { quotaWindowDays: period.quotaWindowDays },
    now,
  );
  if (!window) return null;

  const quota = truncQuota(period.deepseekQuotaPerPeriod);
  const usage = (
    period as { deepseekUsage?: DeepseekPeriodUsage }
  ).deepseekUsage;
  const used = usedInWindow(usage, window.windowIndex);

  return { periodId: period._id, quota, used, window };
}

export async function resolveDeepseekQuota(
  userId: Types.ObjectId,
  now = new Date(),
): Promise<DeepseekQuotaSnapshot | null> {
  const ctx = await loadQuotaContext(userId, now);
  if (!ctx) return null;
  return {
    ...ctx,
    remaining: Math.max(0, ctx.quota - ctx.used),
  };
}

export async function shouldUseDeepseek(
  userId: Types.ObjectId,
  now = new Date(),
): Promise<boolean> {
  const apiKey = env.deepseekApiKey;
  if (!apiKey) return false;

  const ctx = await loadQuotaContext(userId, now);
  if (!ctx) return false;

  return canUseDeepseek({ apiKey, quota: ctx.quota, used: ctx.used });
}

/**
 * Atomic lazy window reset then $inc. Two-step (not pipeline) to match the
 * previous month-rollover pattern and keep concurrent $inc safe.
 */
export async function addDeepseekTokens(
  userId: Types.ObjectId,
  tokens: DeepseekTokenDelta,
  now = new Date(),
): Promise<void> {
  const input = truncNonNeg(tokens.inputTokens);
  const output = truncNonNeg(tokens.outputTokens);
  const total = input + output;
  if (total <= 0) return;

  const period = await userPlanPeriodService.findPeriodContainingNow(userId, now);
  if (!period) {
    logger.warn(
      "No active plan period; skipping DeepSeek usage record",
      logSource,
      "addDeepseekTokens",
    );
    return;
  }

  const window = getQuotaWindow(
    { effectiveDate: period.effectiveDate, untilDate: period.untilDate },
    { quotaWindowDays: period.quotaWindowDays },
    now,
  );
  if (!window) return;

  const periodId = period._id;
  const windowIndex = window.windowIndex;

  await UserPlanPeriodModel.updateOne(
    {
      _id: periodId,
      "deepseekUsage.windowIndex": { $ne: windowIndex },
    },
    {
      $set: {
        deepseekUsage: {
          windowIndex,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          lastUpdatedAt: now,
        },
      },
    },
  );

  const incremented = await UserPlanPeriodModel.updateOne(
    {
      _id: periodId,
      "deepseekUsage.windowIndex": windowIndex,
    },
    {
      $inc: {
        "deepseekUsage.inputTokens": input,
        "deepseekUsage.outputTokens": output,
        "deepseekUsage.totalTokens": total,
      },
      $set: { "deepseekUsage.lastUpdatedAt": now },
    },
  );

  if (incremented.matchedCount > 0) return;

  await UserPlanPeriodModel.updateOne(
    {
      _id: periodId,
      $or: [
        { deepseekUsage: { $exists: false } },
        { "deepseekUsage.windowIndex": { $exists: false } },
      ],
    },
    {
      $set: {
        deepseekUsage: {
          windowIndex,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          lastUpdatedAt: now,
        },
      },
    },
  );

  await UserPlanPeriodModel.updateOne(
    {
      _id: periodId,
      "deepseekUsage.windowIndex": windowIndex,
    },
    {
      $inc: {
        "deepseekUsage.inputTokens": input,
        "deepseekUsage.outputTokens": output,
        "deepseekUsage.totalTokens": total,
      },
      $set: { "deepseekUsage.lastUpdatedAt": now },
    },
  );
}

import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import { PlanModel } from "../../models/plan/plan.model";
import { UserModel } from "../../models/user/user.model";
import { PLAN_NEVER_UNTIL } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { UserPlanPeriodModel } from "../../models/userPlanPeriod/userPlanPeriod.model";
import { addCalendarMonths } from "../../utils/calendarMonth";

const logSource = "modules/userPlanPeriod/migrateUserPlanPeriods.ts";

type LegacyUser = {
  _id: Types.ObjectId;
  isAdmin?: boolean;
  planId?: Types.ObjectId;
  planExpiresAt?: Date | null;
};

/**
 * Idempotent: skip users who already have periods.
 * Admins get sentinel planPeriodUntil. Non-admins get a covering period.
 */
export async function migrateUserPlanPeriods(): Promise<void> {
  const defaultPlan = await PlanModel.findOne({ isDefaultPlan: true })
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();

  const users = await UserModel.find({})
    .select("_id isAdmin planId planExpiresAt planPeriodUntil")
    .lean<LegacyUser[]>();

  const now = new Date();
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.isAdmin) {
      const adminPlanId = user.planId ?? defaultPlan?._id;
      await UserModel.updateOne(
        { _id: user._id },
        {
          $set: {
            ...(adminPlanId ? { planId: adminPlanId } : {}),
            planPeriodUntil: PLAN_NEVER_UNTIL,
            planVersion: 0,
          },
          $unset: { planExpiresAt: "" },
        },
      );
      skipped += 1;
      continue;
    }

    const existingCount = await UserPlanPeriodModel.countDocuments({
      userId: user._id,
    });
    if (existingCount > 0) {
      skipped += 1;
      continue;
    }

    if (!defaultPlan && !user.planId) {
      logger.error(
        `User ${user._id.toString()} has no plan and no default plan exists`,
        logSource,
        "migrateUserPlanPeriods",
      );
      continue;
    }

    const expiresAt =
      user.planExpiresAt instanceof Date && !Number.isNaN(user.planExpiresAt.getTime())
        ? user.planExpiresAt
        : null;

    let planId = user.planId ?? defaultPlan!._id;
    let effectiveDate: Date;
    let untilDate: Date;
    let source: "manual" | "default_sync";

    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      planId = defaultPlan?._id ?? planId;
      effectiveDate = now;
      untilDate = addCalendarMonths(now, 1);
      source = "default_sync";
    } else {
      effectiveDate = user._id.getTimestamp();
      if (effectiveDate.getTime() >= expiresAt.getTime()) {
        effectiveDate = now;
      }
      untilDate = expiresAt;
      source = "manual";
    }

    const planQuota = await PlanModel.findById(planId)
      .select("deepseekQuotaPerPeriod quotaWindowDays")
      .lean<{
        deepseekQuotaPerPeriod?: number;
        quotaWindowDays?: number | null;
      } | null>();
    const deepseekQuotaPerPeriod =
      typeof planQuota?.deepseekQuotaPerPeriod === "number" &&
      Number.isFinite(planQuota.deepseekQuotaPerPeriod) &&
      planQuota.deepseekQuotaPerPeriod > 0
        ? Math.trunc(planQuota.deepseekQuotaPerPeriod)
        : 0;
    const quotaWindowDays =
      typeof planQuota?.quotaWindowDays === "number" &&
      Number.isFinite(planQuota.quotaWindowDays) &&
      planQuota.quotaWindowDays >= 1
        ? Math.trunc(planQuota.quotaWindowDays)
        : null;

    await UserPlanPeriodModel.create({
      userId: user._id,
      planId,
      effectiveDate,
      untilDate,
      source,
      createdBy: null,
      deepseekQuotaPerPeriod,
      quotaWindowDays,
      deepseekTokenAdjustments: [],
    });

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          planId,
          planPeriodUntil: untilDate,
          planVersion: 0,
        },
        $unset: { planExpiresAt: "" },
      },
    );
    migrated += 1;
  }

  logger.info(
    `User plan period migration: migrated=${migrated}, skipped=${skipped}`,
    logSource,
    "migrateUserPlanPeriods",
  );
}

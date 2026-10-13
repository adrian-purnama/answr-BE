import { Types } from "mongoose";
import { PlanModel } from "../../models/plan/plan.model";
import type { PlanInterface } from "../../models/plan/plan.interface";
import { UserModel } from "../../models/user/user.model";
import { userPlanPeriodService } from "./userPlanPeriod.service";

const PLAN_SELECT =
  "name slug accentColor maxApiKeys maxRequestsPerMinute maxArticles maxTopicsPerArticle maxImagesPerTopic maxCharactersPerTopic maxSnippets maxImagesPerSnippet maxCharactersPerSnippet maxGuidances maxCharactersPerGuidance maxLiveAgents liveAgent meetingTool leadCapture whatsApp maxMeetingTopics batchTestGroupAmount questionsPerBatchTestGroup analyticsLookbackDays deepseekQuotaPerPeriod quotaWindowDays isDefaultPlan";

export type ResolvedUserPlan = PlanInterface & { _id: Types.ObjectId };

/**
 * Hot path: cache hit → RO period query → default plan.
 * Never writes; schedules async fillGaps on stale/missing cache.
 * Admins use the same plan-period path as everyone else.
 */
export async function resolveUserPlan(
  userId: Types.ObjectId,
): Promise<ResolvedUserPlan | null> {
  const now = new Date();
  const user = await UserModel.findById(userId).select(
    "planId planPeriodUntil",
  );
  if (!user) {
    throw new Error("User not found");
  }

  const until = user.planPeriodUntil;
  if (
    until instanceof Date &&
    until.getTime() > now.getTime() &&
    user.planId
  ) {
    return PlanModel.findById(user.planId)
      .select(PLAN_SELECT)
      .lean<ResolvedUserPlan | null>();
  }

  const period = await userPlanPeriodService.findPeriodContainingNow(
    userId,
    now,
  );
  userPlanPeriodService.scheduleFillGaps(userId);

  if (period) {
    return userPlanPeriodService.loadPlanDoc(period.planId);
  }

  return userPlanPeriodService.getDefaultPlanDoc();
}

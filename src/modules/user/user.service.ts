import * as bcrypt from "bcrypt";
import { Types } from "mongoose";
import type {
  AdminUserListOutDto,
  AdminUserOutDto,
  UpdateAdminUserDto,
} from "../../dto/adminUser.dto";
import type { DashboardOverviewOutDto } from "../../dto/dashboardOverview.dto";
import type { DeepseekUsageOutDto } from "../../dto/deepseekUsage.dto";
import type {
  UserPlanOutDto,
  UserPlanStatusOutDto,
} from "../../dto/userPlan.dto";
import {
  resolveDeepseekQuota,
  usedInWindow,
} from "../../llm/deepseek/deepseekQuota";
import { getQuotaWindow } from "../../llm/deepseek/getQuotaWindow";
import { logger } from "../../logger/logger";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { PlanModel } from "../../models/plan/plan.model";
import type { PlanInterface } from "../../models/plan/plan.interface";
import { UserModel } from "../../models/user/user.model";
import {
  isNeverUntil,
  type DeepseekPeriodUsage,
} from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { WidgetUsageDailyModel } from "../../models/widgetUsageDaily/widgetUsageDaily.model";
import { escapeRegex } from "../../validation/adminUser";
import { resolveUserPlan } from "../userPlanPeriod/resolveUserPlan";
import { userPlanPeriodService } from "../userPlanPeriod/userPlanPeriod.service";

function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
const logSource = "modules/user/user.service.ts";

function truncTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.trunc(value);
}

export type AuthorshipDoc = {
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  userId: Types.ObjectId;
};

export function authorshipIds(docs: AuthorshipDoc[]): Types.ObjectId[] {
  return docs.flatMap((doc) => [
    doc.createdBy ?? doc.userId,
    doc.updatedBy ?? doc.createdBy ?? doc.userId,
  ]);
}

export function authorshipEmails(
  doc: AuthorshipDoc,
  emails: Map<string, string>,
): { createdBy: string | null; updatedBy: string | null } {
  return {
    createdBy: emails.get((doc.createdBy ?? doc.userId).toString()) ?? null,
    updatedBy:
      emails.get((doc.updatedBy ?? doc.createdBy ?? doc.userId).toString()) ??
      null,
  };
}

type UserPlanDoc = Pick<
  PlanInterface,
  | "name"
  | "slug"
  | "accentColor"
  | "maxApiKeys"
  | "maxRequestsPerMinute"
  | "maxArticles"
  | "maxTopicsPerArticle"
  | "maxImagesPerTopic"
  | "maxCharactersPerTopic"
  | "maxSnippets"
  | "maxImagesPerSnippet"
  | "maxCharactersPerSnippet"
  | "maxGuidances"
  | "maxCharactersPerGuidance"
  | "maxLiveAgents"
  | "liveAgent"
  | "meetingTool"
  | "leadCapture"
  | "whatsApp"
  | "maxMeetingTopics"
  | "batchTestGroupAmount"
  | "questionsPerBatchTestGroup"
  | "analyticsLookbackDays"
  | "deepseekQuotaPerPeriod"
  | "quotaWindowDays"
  | "isDefaultPlan"
> & { _id: Types.ObjectId };

function toUserPlanOutDto(doc: UserPlanDoc): UserPlanOutDto {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    accentColor: doc.accentColor,
    maxApiKeys: doc.maxApiKeys,
    maxRequestsPerMinute: doc.maxRequestsPerMinute,
    maxArticles: doc.maxArticles ?? 10,
    maxTopicsPerArticle: doc.maxTopicsPerArticle ?? 50,
    maxImagesPerTopic: doc.maxImagesPerTopic ?? 10,
    maxCharactersPerTopic: doc.maxCharactersPerTopic ?? 10000,
    maxSnippets: doc.maxSnippets ?? 50,
    maxImagesPerSnippet: doc.maxImagesPerSnippet ?? 10,
    maxCharactersPerSnippet: doc.maxCharactersPerSnippet ?? 5000,
    maxGuidances: doc.maxGuidances ?? 10,
    maxCharactersPerGuidance: doc.maxCharactersPerGuidance ?? 2000,
    maxLiveAgents: doc.maxLiveAgents ?? 0,
    liveAgent: doc.liveAgent ?? false,
    meetingTool: doc.meetingTool ?? false,
    leadCapture: doc.leadCapture ?? false,
    whatsApp: doc.whatsApp ?? false,
    maxMeetingTopics: doc.maxMeetingTopics ?? 0,
    batchTestGroupAmount: doc.batchTestGroupAmount ?? 5,
    questionsPerBatchTestGroup: doc.questionsPerBatchTestGroup ?? 50,
    analyticsLookbackDays: doc.analyticsLookbackDays ?? 30,
    isDefaultPlan: doc.isDefaultPlan ?? false,
  };
}
type PopulatedUserDoc = {
  _id: Types.ObjectId;
  email?: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
  planPeriodUntil?: Date | null;
  planId?: {
    _id: Types.ObjectId;
    name: string;
  } | null;
};

function toAdminUserOutDto(doc: PopulatedUserDoc): AdminUserOutDto {
  if (!doc.email) {
    throw new Error("User is missing required email data");
  }

  const plan = doc.planId;
  const until = doc.planPeriodUntil;
  const never =
    until instanceof Date && !Number.isNaN(until.getTime()) && isNeverUntil(until);

  return {
    id: doc._id.toString(),
    email: doc.email,
    planId: plan?._id?.toString() ?? null,
    planName: plan?.name ?? null,
    planExpiresAt:
      never || !(until instanceof Date) || Number.isNaN(until.getTime())
        ? null
        : until.toISOString(),
    isAdmin: doc.isAdmin ?? false,
    isBlocked: doc.isBlocked ?? false,
  };
}

export class UserService {
  async listForAdmin(input: {
    email: string;
    page: number;
    pageSize: number;
  }): Promise<AdminUserListOutDto> {
    const trimmed = input.email.trim();
    const filter =
      trimmed.length > 0
        ? { email: { $regex: escapeRegex(trimmed), $options: "i" } }
        : {};

    const page = Math.max(1, Math.trunc(input.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize)));
    const skip = (page - 1) * pageSize;

    const [total, users] = await Promise.all([
      UserModel.countDocuments(filter),
      UserModel.find(filter)
        .populate<{ planId: { _id: Types.ObjectId; name: string } }>(
          "planId",
          "name",
        )
        .sort({ email: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean<PopulatedUserDoc[]>(),
    ]);

    return {
      items: users.filter((user) => user.email).map(toAdminUserOutDto),
      page,
      pageSize,
      total,
    };
  }

  async updateByAdmin(
    id: string,
    patch: UpdateAdminUserDto,
  ): Promise<AdminUserOutDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Invalid user id");
    }

    const userId = new Types.ObjectId(id);
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (patch.password === undefined) {
      throw new Error("No valid fields to update");
    }

    const hashedPassword = await bcrypt.hash(patch.password, 10);
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { hashedPassword } },
      { new: true },
    )
      .populate<{ planId: { _id: Types.ObjectId; name: string } }>(
        "planId",
        "name",
      )
      .lean<PopulatedUserDoc>();

    if (!updated || !updated.email) {
      throw new Error("Failed to update user");
    }

    logger.info(`User updated by admin: ${updated.email}`, logSource, "updateByAdmin");
    return toAdminUserOutDto(updated);
  }

  async getForAdmin(id: string): Promise<{
    user: AdminUserOutDto;
    accountCreatedAt: string;
    deepseekQuotaPerPeriod: number;
    deepseekWindow: {
      windowIndex: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      windowStart: string | null;
      windowEnd: string | null;
    } | null;
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Invalid user id");
    }

    const userId = new Types.ObjectId(id);
    const doc = await UserModel.findById(userId)
      .populate<{
        planId: { _id: Types.ObjectId; name: string } | null;
      }>("planId", "name")
      .lean<{
        _id: Types.ObjectId;
        email?: string;
        isAdmin?: boolean;
        isBlocked?: boolean;
        planPeriodUntil?: Date | null;
        planId?: {
          _id: Types.ObjectId;
          name: string;
        } | null;
      }>();

    if (!doc?.email) {
      throw new Error("User not found");
    }

    const now = new Date();
    const period = await userPlanPeriodService.findPeriodContainingNow(
      userId,
      now,
    );
    let deepseekQuotaPerPeriod = 0;
    let deepseekWindow: {
      windowIndex: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      windowStart: string | null;
      windowEnd: string | null;
    } | null = null;

    if (period) {
      const raw = period.deepseekQuotaPerPeriod ?? 0;
      deepseekQuotaPerPeriod =
        typeof raw === "number" && Number.isFinite(raw) && raw > 0
          ? Math.trunc(raw)
          : 0;

      const window = getQuotaWindow(
        {
          effectiveDate: period.effectiveDate,
          untilDate: period.untilDate,
        },
        { quotaWindowDays: period.quotaWindowDays },
        now,
      );
      if (window) {
        const usage = period.deepseekUsage as DeepseekPeriodUsage | undefined;
        const sameWindow = usage?.windowIndex === window.windowIndex;
        deepseekWindow = {
          windowIndex: window.windowIndex,
          inputTokens: sameWindow ? truncTokens(usage?.inputTokens) : 0,
          outputTokens: sameWindow ? truncTokens(usage?.outputTokens) : 0,
          totalTokens: usedInWindow(usage, window.windowIndex),
          windowStart: window.windowStart.toISOString(),
          windowEnd: window.windowEnd.toISOString(),
        };
      }
    }

    return {
      user: toAdminUserOutDto(doc),
      accountCreatedAt: doc._id.getTimestamp().toISOString(),
      deepseekQuotaPerPeriod,
      deepseekWindow,
    };
  }

  async getUserPlan(userId: Types.ObjectId) {
    return resolveUserPlan(userId) as Promise<UserPlanDoc | null>;
  }

  async emailsByIds(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (unique.length === 0) return new Map();
    const users = await UserModel.find({
      _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
    })
      .select("email")
      .lean<Array<{ _id: Types.ObjectId; email: string }>>();
    return new Map(users.map((user) => [user._id.toString(), user.email]));
  }

  async getMyPlan(userId: Types.ObjectId): Promise<UserPlanOutDto> {
    const plan = await this.getUserPlan(userId);
    if (!plan) {
      throw new Error("Plan not found");
    }
    return toUserPlanOutDto(plan);
  }

  async getMyPlanStatus(userId: Types.ObjectId): Promise<UserPlanStatusOutDto> {
    const user = await UserModel.findById(userId)
      .select("planPeriodUntil")
      .lean<{ planPeriodUntil?: Date | null } | null>();
    if (!user) {
      throw new Error("User not found");
    }

    const plan = await this.getMyPlan(userId);
    const timeline = await userPlanPeriodService.listTimeline(userId);
    const nowMs = Date.now();
    const until = user.planPeriodUntil;
    const neverExpires =
      until instanceof Date &&
      !Number.isNaN(until.getTime()) &&
      isNeverUntil(until);
    const planExpiresAt =
      neverExpires ||
      !(until instanceof Date) ||
      Number.isNaN(until.getTime())
        ? null
        : until.toISOString();

    const next = timeline.periods
      .filter((p) => new Date(p.effectiveDate).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.effectiveDate).getTime() -
          new Date(b.effectiveDate).getTime(),
      )[0];

    return {
      plan,
      planExpiresAt,
      neverExpires,
      timeline,
      nextPeriod: next
        ? {
            planId: next.planId,
            planName: next.planName,
            effectiveDate: next.effectiveDate,
            untilDate: next.untilDate,
            neverExpires: next.neverExpires,
          }
        : null,
    };
  }

  async getDeepseekUsage(userId: Types.ObjectId): Promise<DeepseekUsageOutDto> {
    const snapshot = await resolveDeepseekQuota(userId);
    const quota = snapshot?.quota ?? 0;
    const used = snapshot?.used ?? 0;
    const percent =
      quota > 0
        ? Math.max(0, Math.min(100, Math.round((used / quota) * 100)))
        : 0;

    return { percent };
  }

  async getDashboardOverview(
    userId: Types.ObjectId,
  ): Promise<DashboardOverviewOutDto> {
    const plan = await this.getUserPlan(userId);
    const lookbackDays = Math.max(
      1,
      Math.floor(plan?.analyticsLookbackDays ?? 30),
    );

    const now = new Date();
    const toDay = utcDayStart(now);
    const fromDay = new Date(toDay);
    fromDay.setUTCDate(fromDay.getUTCDate() - (lookbackDays - 1));

    const keys = await ApiKeyModel.find({
      userId,
      "status.status": { $ne: "revoked" },
    })
      .select("_id label status.status")
      .sort({ _id: 1 })
      .lean<
        Array<{
          _id: Types.ObjectId;
          label: string;
          status: { status: string };
        }>
      >();

    const keyIds = keys.map((k) => k._id);
    type AggRow = {
      _id: Types.ObjectId;
      visits: number;
      chatUsed: number;
      faqViews: number;
      newsViews: number;
    };

    const aggregated =
      keyIds.length === 0
        ? []
        : await WidgetUsageDailyModel.aggregate<AggRow>([
            {
              $match: {
                userId,
                apiKeyId: { $in: keyIds },
                date: { $gte: fromDay, $lte: toDay },
              },
            },
            {
              $group: {
                _id: "$apiKeyId",
                visits: { $sum: "$visits" },
                chatUsed: { $sum: "$chatUsed" },
                faqViews: { $sum: "$faqViews" },
                newsViews: { $sum: "$newsViews" },
              },
            },
          ]);

    const byKey = new Map(
      aggregated.map((row) => [
        row._id.toString(),
        {
          visits: row.visits ?? 0,
          chatUsed: row.chatUsed ?? 0,
          faqViews: row.faqViews ?? 0,
          newsViews: row.newsViews ?? 0,
        },
      ]),
    );

    const projects = keys
      .map((key) => {
        const stats = byKey.get(key._id.toString()) ?? {
          visits: 0,
          chatUsed: 0,
          faqViews: 0,
          newsViews: 0,
        };
        return {
          apiKeyId: key._id.toString(),
          label: key.label,
          status: key.status.status,
          visits: stats.visits,
          chatUsed: stats.chatUsed,
          faqViews: stats.faqViews,
          newsViews: stats.newsViews,
        };
      })
      .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label));

    let visits = 0;
    let chatUsed = 0;
    let faqViews = 0;
    let newsViews = 0;
    for (const p of projects) {
      visits += p.visits;
      chatUsed += p.chatUsed;
      faqViews += p.faqViews;
      newsViews += p.newsViews;
    }

    const hottest = projects.find((p) => p.visits > 0) ?? null;

    return {
      from: fromDay.toISOString(),
      to: now.toISOString(),
      lookbackDays,
      totals: {
        visits,
        chatUsed,
        faqViews,
        newsViews,
        involvementRate:
          visits > 0 ? Math.round((chatUsed / visits) * 1000) / 10 : 0,
      },
      projects: projects.map(({ faqViews: _f, newsViews: _n, ...rest }) => rest),
      hottestApiKeyId: hottest?.apiKeyId ?? null,
    };
  }
}

export const userService = new UserService();

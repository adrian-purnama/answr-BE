import crypto from "crypto";
import { Types } from "mongoose";
import type {
  SubmitWidgetAiFeedbackDto,
  WidgetAiFeedbackOutDto,
  WidgetAnalyticsSummaryOutDto,
  WidgetCsatCommentDto,
  WidgetCsatSummaryDto,
  WidgetUsageNamedCountDto,
  WidgetVisitOutDto,
} from "../../dto/widgetAnalytics.dto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { ArticleModel } from "../../models/article/article.model";
import { LiveAgentTicketModel } from "../../models/liveAgentTicket/liveAgentTicket.model";
import { NewsModel } from "../../models/news/news.model";
import { WidgetAiFeedbackModel } from "../../models/widgetAiFeedback/widgetAiFeedback.model";
import type { WidgetAiFeedbackInterface } from "../../models/widgetAiFeedback/widgetAiFeedback.interface";
import { WidgetUsageDailyModel } from "../../models/widgetUsageDaily/widgetUsageDaily.model";
import type { WidgetUsageDailyInterface } from "../../models/widgetUsageDaily/widgetUsageDaily.interface";
import { WidgetVisitCooldownModel } from "../../models/widgetVisitCooldown/widgetVisitCooldown.model";
import Widget from "../../models/widget/widget.model";
import type { WidgetInterface } from "../../models/widget/widget.interface";
import { entitlementService } from "../entitlement/entitlement.service";
import { verifyPublicSessionId } from "../../utils/publicSessionToken";

const logSource = "modules/widgetAnalytics/widgetAnalytics.service.ts";
const VISIT_COOLDOWN_MS = 30 * 60 * 1000;
const TOP_N = 8;

type WidgetDoc = WidgetInterface & { _id: Types.ObjectId };
type DailyDoc = WidgetUsageDailyInterface & { _id: Types.ObjectId };
type FeedbackDoc = WidgetAiFeedbackInterface & { _id: Types.ObjectId };

function utcDayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function mapToRecord(
  value: Map<string, number> | Record<string, number> | undefined,
): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return { ...value };
}

function mapKey(raw: string): string {
  const trimmed = raw.trim().slice(0, 64) || "Unknown";
  return trimmed.replace(/[.$]/g, "_");
}

function usageKey(
  apiKeyId: Types.ObjectId,
  kind: "visit" | "faq" | "news",
  ip: string,
  contentId = "",
): string {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(`${apiKeyId.toString()}:${kind}:${contentId}:${ip || "unknown"}`)
    .digest("hex");
}

async function claimCooldown(key: string): Promise<boolean> {
  try {
    await WidgetVisitCooldownModel.create({
      key,
      expireAt: new Date(Date.now() + VISIT_COOLDOWN_MS),
    });
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    if (code === 11000) return false;
    throw error;
  }
}

function mergeMaps(
  into: Record<string, number>,
  from: Map<string, number> | Record<string, number> | undefined,
): void {
  for (const [key, value] of Object.entries(mapToRecord(from))) {
    into[key] = (into[key] ?? 0) + value;
  }
}

function ranked(
  counts: Record<string, number>,
  labels?: Map<string, string>,
): WidgetUsageNamedCountDto[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, count]) => ({
      id,
      label: labels?.get(id) ?? id,
      count,
    }));
}

async function bumpDaily(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  inc: Record<string, number>,
): Promise<void> {
  const date = utcDayStart(new Date());
  await WidgetUsageDailyModel.updateOne(
    { userId, apiKeyId, date },
    {
      $inc: inc,
      $setOnInsert: { userId, apiKeyId, date },
    },
    { upsert: true },
  );
}

function emptyCsat(): WidgetCsatSummaryDto {
  return {
    averageStars: null,
    ratingCount: 0,
    recent: [],
    byAgent: [],
  };
}

function csatFromRows(
  rows: Array<{
    stars: number;
    feedback: string;
    submittedAt: Date;
    agentName?: string | null;
  }>,
): WidgetCsatSummaryDto {
  if (rows.length === 0) return emptyCsat();
  const sum = rows.reduce((acc, row) => acc + row.stars, 0);
  const byAgentMap = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const name = row.agentName?.trim();
    if (!name) continue;
    const current = byAgentMap.get(name) ?? { sum: 0, count: 0 };
    current.sum += row.stars;
    current.count += 1;
    byAgentMap.set(name, current);
  }
  const recent: WidgetCsatCommentDto[] = [...rows]
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
    .map((row) => ({
      stars: row.stars,
      feedback: row.feedback,
      ...(row.agentName?.trim() ? { agentName: row.agentName.trim() } : {}),
      submittedAt: row.submittedAt.toISOString(),
    }));
  return {
    averageStars: Math.round((sum / rows.length) * 10) / 10,
    ratingCount: rows.length,
    recent,
    byAgent: [...byAgentMap.entries()]
      .map(([name, stats]) => ({
        name,
        averageStars: Math.round((stats.sum / stats.count) * 10) / 10,
        ratingCount: stats.count,
      }))
      .sort((a, b) => b.ratingCount - a.ratingCount),
  };
}

class WidgetAnalyticsService {
  async recordVisit(publicKey: string, ip: string): Promise<WidgetVisitOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) throw new Error("Widget not found");

    const widget = await Widget.findOne({
      publicKey: trimmed,
    }).lean<WidgetDoc>();
    if (!widget || !widget.enabled) {
      throw new Error("Widget not found");
    }

    const claimed = await claimCooldown(
      usageKey(widget.apiKeyId, "visit", ip),
    );
    if (!claimed) return { counted: false };

    await bumpDaily(widget.userId, widget.apiKeyId, { visits: 1 });
    return { counted: true };
  }

  async recordChatUsed(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    try {
      await bumpDaily(userId, apiKeyId, { chatUsed: 1 });
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : "Failed to record chat used",
        logSource,
        "recordChatUsed",
      );
    }
  }

  async recordFaqView(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    ip: string,
  ): Promise<void> {
    try {
      const claimed = await claimCooldown(
        usageKey(apiKeyId, "faq", ip, articleId),
      );
      if (!claimed) return;
      await bumpDaily(userId, apiKeyId, {
        faqViews: 1,
        [`byFaqArticleId.${mapKey(articleId)}`]: 1,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : "Failed to record FAQ view",
        logSource,
        "recordFaqView",
      );
    }
  }

  async recordNewsView(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    newsId: string,
    ip: string,
  ): Promise<void> {
    try {
      const claimed = await claimCooldown(
        usageKey(apiKeyId, "news", ip, newsId),
      );
      if (!claimed) return;
      await bumpDaily(userId, apiKeyId, {
        newsViews: 1,
        [`byNewsId.${mapKey(newsId)}`]: 1,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : "Failed to record news view",
        logSource,
        "recordNewsView",
      );
    }
  }

  async submitAiFeedback(
    publicKey: string,
    sessionId: string,
    input: SubmitWidgetAiFeedbackDto,
  ): Promise<WidgetAiFeedbackOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) throw new Error("Widget not found");
    const canonicalSessionId = verifyPublicSessionId(trimmed, sessionId);

    const widget = await Widget.findOne({
      publicKey: trimmed,
    }).lean<WidgetDoc>();
    if (!widget || !widget.enabled) {
      throw new Error("Widget not found");
    }

    const chatSessionId = new Types.ObjectId(canonicalSessionId);

    const liveRated = await LiveAgentTicketModel.exists({
      publicKey: trimmed,
      chatSessionId,
      "rating.stars": { $gte: 1 },
    });
    if (liveRated) {
      throw new Error("Rating already submitted");
    }

    const existing = await WidgetAiFeedbackModel.exists({ chatSessionId });
    if (existing) {
      throw new Error("Rating already submitted");
    }

    try {
      const doc = await WidgetAiFeedbackModel.create({
        userId: widget.userId,
        apiKeyId: widget.apiKeyId,
        publicKey: trimmed,
        chatSessionId,
        stars: input.stars,
        feedback: input.feedback?.trim() ?? "",
        trigger: input.trigger,
      });
      return {
        chatSessionId: doc.chatSessionId.toString(),
        stars: doc.stars,
        submitted: true,
      };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: number }).code
          : undefined;
      if (code === 11000) {
        throw new Error("Rating already submitted");
      }
      throw error;
    }
  }

  async getSummary(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<WidgetAnalyticsSummaryOutDto> {
    const range = await entitlementService.resolveAnalyticsDateRange(
      userId,
      apiKeyId,
      from,
      to,
    );
    const fromDay = utcDayStart(range.from);
    const toDay = utcDayStart(range.to);

    const days = await WidgetUsageDailyModel.find({
      apiKeyId,
      date: { $gte: fromDay, $lte: toDay },
    }).lean<DailyDoc[]>();

    let visits = 0;
    let chatUsed = 0;
    let faqViews = 0;
    let newsViews = 0;
    const byFaq: Record<string, number> = {};
    const byNews: Record<string, number> = {};

    for (const day of days) {
      visits += day.visits ?? 0;
      chatUsed += day.chatUsed ?? 0;
      faqViews += day.faqViews ?? 0;
      newsViews += day.newsViews ?? 0;
      mergeMaps(byFaq, day.byFaqArticleId);
      mergeMaps(byNews, day.byNewsId);
    }

    const [
      faqLabels,
      newsLabels,
      aiDocs,
      liveDocs,
      aiResolvedCount,
      liveAgentRoutedCount,
    ] = await Promise.all([
      this.articleLabels(Object.keys(byFaq)),
      this.newsLabels(Object.keys(byNews)),
      WidgetAiFeedbackModel.find({
        apiKeyId,
        createdAt: { $gte: range.from, $lte: range.to },
      })
        .sort({ createdAt: -1 })
        .lean<FeedbackDoc[]>(),
      LiveAgentTicketModel.find({
        apiKeyId,
        "rating.stars": { $gte: 1 },
        "rating.submittedAt": { $gte: range.from, $lte: range.to },
      })
        .select("rating assignedAgentName")
        .lean(),
      WidgetAiFeedbackModel.countDocuments({
        apiKeyId,
        trigger: "resolved",
        createdAt: { $gte: range.from, $lte: range.to },
      }),
      LiveAgentTicketModel.countDocuments({
        apiKeyId,
        createdAt: { $gte: range.from, $lte: range.to },
      }),
    ]);

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      lookbackDays: range.lookbackDays,
      visits,
      chatUsed,
      involvementRate: visits > 0 ? Math.round((chatUsed / visits) * 1000) / 10 : 0,
      faqViews,
      newsViews,
      aiResolvedCount,
      liveAgentRoutedCount,
      topFaq: ranked(byFaq, faqLabels),
      topNews: ranked(byNews, newsLabels),
      aiAgent: csatFromRows(
        aiDocs.map((doc) => ({
          stars: doc.stars,
          feedback: doc.feedback,
          submittedAt: doc.createdAt,
        })),
      ),
      liveAgent: csatFromRows(
        liveDocs
          .filter((doc) => doc.rating)
          .map((doc) => ({
            stars: doc.rating!.stars,
            feedback: doc.rating!.feedback ?? "",
            submittedAt: doc.rating!.submittedAt,
            agentName: doc.assignedAgentName,
          })),
      ),
    };
  }

  private async articleLabels(ids: string[]): Promise<Map<string, string>> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) return new Map();
    const docs = await ArticleModel.find({ _id: { $in: objectIds } })
      .select("title")
      .lean<Array<{ _id: Types.ObjectId; title: string }>>();
    return new Map(docs.map((doc) => [doc._id.toString(), doc.title]));
  }

  private async newsLabels(ids: string[]): Promise<Map<string, string>> {
    const objectIds = ids
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) return new Map();
    const docs = await NewsModel.find({ _id: { $in: objectIds } })
      .select("title")
      .lean<Array<{ _id: Types.ObjectId; title: string }>>();
    return new Map(docs.map((doc) => [doc._id.toString(), doc.title]));
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await WidgetUsageDailyModel.deleteMany({ apiKeyId });
    await WidgetAiFeedbackModel.deleteMany({ apiKeyId });
  }
}

export const widgetAnalyticsService = new WidgetAnalyticsService();

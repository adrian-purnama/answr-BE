import { Types } from "mongoose";
import type {
  AnalyticsCategoryOutDto,
  ChatAnalyticsConversationOutDto,
  ChatAnalyticsRecordOutDto,
  ChatAnalyticsRecordsPageOutDto,
  ChatAnalyticsSummaryOutDto,
  ChatAnalyticsTrendsOutDto,
  CreateAnalyticsCategoryDto,
  UpdateAnalyticsCategoryDto,
} from "../../dto/chatAnalytics.dto";
import { logger } from "../../logger/logger";
import {
  layaClient,
  type LayaAnswer,
  type LayaChoiceQuestion,
} from "../../llm/laya/layaClient";
import {
  AnalyticsCategoryModel,
} from "../../models/analyticsCategory/analyticsCategory.model";
import {
  ANALYTICS_OPTION_DIMENSIONS,
  PROJECT_ANALYTICS_OPTION_SEEDS,
  UNCATEGORIZED_CATEGORY_SEED,
  type AnalyticsCategoryInterface,
  type AnalyticsOptionDimension,
} from "../../models/analyticsCategory/analyticsCategory.interface";
import { ChatAnalyticsModel } from "../../models/chatAnalytics/chatAnalytics.model";
import type { ChatAnalyticsInterface } from "../../models/chatAnalytics/chatAnalytics.interface";
import { ChatAnalyticsJobModel } from "../../models/chatAnalyticsJob/chatAnalyticsJob.model";
import { ChatAnalyticsDailyModel } from "../../models/chatAnalyticsDaily/chatAnalyticsDaily.model";
import { ChatMessageModel } from "../../models/message/message.model";
import type { ChatMessageInterface } from "../../models/message/message.interface";
import {
  type AgentExecutionMode,
  type AnalyticsGapGroup,
  type AnalyticsGapType,
  type ChatMessageAnalysis,
  isKnowledgeGapType,
  KNOWLEDGE_GAP_TYPES,
  type MessageAnalyticsType,
} from "../../models/message/messageAnalytics.types";
import { entitlementService } from "../entitlement/entitlement.service";
import { kickChatAnalyticsWorker } from "./chatAnalytics.worker";

const logSource = "modules/chatAnalytics/chatAnalytics.service.ts";
const HISTORY_LIMIT = 10;

type CategoryDoc = AnalyticsCategoryInterface & { _id: Types.ObjectId };
type AnalyticsDoc = ChatAnalyticsInterface & { _id: Types.ObjectId };

function textFromMessage(message: ChatMessageInterface): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => ("content" in block ? block.content : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function utcDayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function mapToRecord(
  value: Map<string, number> | Record<string, number> | undefined,
): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  return { ...value };
}

function toCategoryOutDto(doc: CategoryDoc): AnalyticsCategoryOutDto {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    ...(doc.description ? { description: doc.description } : {}),
    dimension: doc.dimension ?? "category",
    isSystem: doc.isSystem,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toRecordOutDto(
  doc: AnalyticsDoc,
  categoryName?: string,
): ChatAnalyticsRecordOutDto {
  const sessionId = doc.chatSessionId.toString();
  return {
    id: doc._id.toString(),
    chatMessageId: doc.chatMessageId.toString(),
    chatSessionId: sessionId,
    conversationId: sessionId,
    userId: doc.userId.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    categoryId: doc.categoryId.toString(),
    ...(categoryName ? { categoryName } : {}),
    type: doc.type,
    ...(doc.intent ? { intent: doc.intent } : {}),
    answerable: doc.answerable,
    confidence: doc.confidence,
    gapDetected: doc.gapDetected,
    ...(doc.gapType ? { gapType: doc.gapType } : {}),
    ...(doc.gapReason ? { gapReason: doc.gapReason } : {}),
    gapResolved: doc.gapResolved === true,
    ...(doc.gapResolvedAt
      ? { gapResolvedAt: doc.gapResolvedAt.toISOString() }
      : {}),
    messageRole: doc.messageRole,
    messageCreatedAt: doc.messageCreatedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

type ClassifyResult = {
  categoryId: Types.ObjectId;
  type: MessageAnalyticsType;
  intent?: string;
  answerable: boolean | null;
  confidence: number;
  gapDetected: boolean;
  gapType?: AnalyticsGapType;
  gapReason?: string;
};

export type AnalyzeCompletedTurnInput = {
  executionMode: AgentExecutionMode;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  chatSessionId: Types.ObjectId;
  userMessageId: Types.ObjectId;
  assistantMessageId?: Types.ObjectId;
  tools?: Array<{ name: string; ok: boolean }>;
};

const TYPE_FALLBACK = "query";
const NO_GAP_SLUG = "no_gap";
const NOTHING_TO_CLASSIFY_CONFIDENCE = 0.5;
const CLASSIFY_FAILURE_CONFIDENCE = 0.2;

function optionTrigger(option: CategoryDoc): string {
  return option.description?.trim() || option.name;
}

function choiceCriteria(options: CategoryDoc[]): Record<string, string> {
  return Object.fromEntries(
    options.map((option) => [option.slug, optionTrigger(option)]),
  );
}

function choiceSlug(
  answers: Record<string, LayaAnswer>,
  name: string,
): string | undefined {
  const answer = answers[name];
  if (!answer || answer.type !== "choice") return undefined;
  const choice = answer.choice.trim().toLowerCase();
  return choice || undefined;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function confidenceFromAnswers(
  answers: Record<string, LayaAnswer>,
  askedCategory: boolean,
): number {
  const category = answers.category;
  if (
    askedCategory &&
    category &&
    typeof category.confidence === "number" &&
    Number.isFinite(category.confidence)
  ) {
    return clampUnit(category.confidence);
  }
  const values = Object.values(answers)
    .map((answer) => answer.confidence)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return NOTHING_TO_CLASSIFY_CONFIDENCE;
  return clampUnit(Math.min(...values));
}

function applyToolOutcomeOverride(
  classified: ClassifyResult,
  tools: Array<{ name: string; ok: boolean }> | undefined,
): ClassifyResult {
  if (!tools || tools.length === 0) {
    return classified;
  }
  if (tools.some((tool) => tool.ok)) {
    return {
      ...classified,
      answerable: true,
      gapDetected: false,
      gapType: undefined,
      gapReason: undefined,
    };
  }
  return {
    ...classified,
    answerable: false,
    gapDetected: true,
    gapType: "tool_failure",
    gapReason:
      classified.gapReason ??
      "One or more tools were called but none succeeded.",
  };
}

function answerableFromSlug(
  slug: string,
  options: CategoryDoc[],
): boolean | null {
  const match = options.find((option) => option.slug === slug);
  if (!match) return null;
  if (match.slug === "answerable") return true;
  if (match.slug === "unanswerable") return false;
  return null;
}

function classificationFromAnswers(
  answers: Record<string, LayaAnswer>,
  options: {
    categories: CategoryDoc[];
    types: CategoryDoc[];
    gaps: CategoryDoc[];
    answerables: CategoryDoc[];
    intents: CategoryDoc[];
  },
  fallback: CategoryDoc,
): ClassifyResult {
  const categorySlug = choiceSlug(answers, "category") ?? "";
  const category =
    options.categories.find((option) => option.slug === categorySlug) ??
    fallback;

  const typeSlug = choiceSlug(answers, "type") ?? "";
  const typeMatch = options.types.find((option) => option.slug === typeSlug);
  const type =
    options.types.length === 0
      ? TYPE_FALLBACK
      : (typeMatch?.slug ?? TYPE_FALLBACK);

  const intentSlug = choiceSlug(answers, "intent") ?? "";
  const intentMatch = options.intents.find(
    (option) => option.slug === intentSlug,
  );
  const intent =
    options.intents.length > 0 && intentMatch
      ? intentMatch.name.slice(0, 200)
      : undefined;

  const answerableSlug = choiceSlug(answers, "answerable");
  const answerable =
    options.answerables.length > 0 && answerableSlug
      ? answerableFromSlug(answerableSlug, options.answerables)
      : null;

  const gapSlug = choiceSlug(answers, "gap") ?? "";
  const gapMatch =
    options.gaps.length > 0
      ? options.gaps.find((option) => option.slug === gapSlug)
      : undefined;

  return {
    categoryId: category._id,
    type,
    ...(intent ? { intent } : {}),
    answerable,
    confidence: confidenceFromAnswers(
      answers,
      options.categories.length > 0,
    ),
    gapDetected: Boolean(gapMatch),
    ...(gapMatch ? { gapType: gapMatch.slug } : {}),
  };
}

class ChatAnalyticsService {
  private systemSeedPromise: Promise<void> | null = null;
  private indexPromise: Promise<void> | null = null;

  async ensureSystemCategories(): Promise<void> {
    if (!this.systemSeedPromise) {
      this.systemSeedPromise = this.seedSystemCategories().finally(() => {
        this.systemSeedPromise = null;
      });
    }
    await this.systemSeedPromise;
  }

  private ensureOptionIndexes(): Promise<void> {
    if (!this.indexPromise) {
      this.indexPromise = this.relaxProjectSlugIndex().catch((error: unknown) => {
        this.indexPromise = null;
        throw error;
      });
    }
    return this.indexPromise;
  }

  private async relaxProjectSlugIndex(): Promise<void> {
    const indexes = await AnalyticsCategoryModel.collection.indexes();
    for (const index of indexes) {
      const keyNames = Object.keys(index.key ?? {});
      if (
        index.unique &&
        index.name &&
        keyNames.includes("apiKeyId") &&
        keyNames.includes("slug") &&
        !keyNames.includes("dimension")
      ) {
        await AnalyticsCategoryModel.collection.dropIndex(index.name);
      }
    }
    await AnalyticsCategoryModel.syncIndexes();
  }

  private async seedSystemCategories(): Promise<void> {
    await AnalyticsCategoryModel.updateOne(
      { isSystem: true, slug: UNCATEGORIZED_CATEGORY_SEED.slug },
      {
        $setOnInsert: {
          name: UNCATEGORIZED_CATEGORY_SEED.name,
          slug: UNCATEGORIZED_CATEGORY_SEED.slug,
          dimension: "category",
          isSystem: true,
          userId: null,
          apiKeyId: null,
          isActive: true,
        },
      },
      { upsert: true },
    );
    await AnalyticsCategoryModel.updateMany(
      { isSystem: true, dimension: { $exists: false } },
      { $set: { dimension: "category" } },
    );
  }

  private async ensureProjectCategories(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    await this.ensureOptionIndexes();
    await AnalyticsCategoryModel.updateMany(
      { apiKeyId, isSystem: false, dimension: { $exists: false } },
      { $set: { dimension: "category" } },
    );
    for (const dimension of ANALYTICS_OPTION_DIMENSIONS) {
      for (const seed of PROJECT_ANALYTICS_OPTION_SEEDS[dimension]) {
        await AnalyticsCategoryModel.updateOne(
          { apiKeyId, dimension, slug: seed.slug, isSystem: false },
          {
            $setOnInsert: {
              name: seed.name,
              slug: seed.slug,
              description: seed.description,
              dimension,
              isSystem: false,
              userId,
              apiKeyId,
              isActive: true,
            },
          },
          { upsert: true },
        );
      }
    }
  }

  private async getUncategorizedCategory(): Promise<CategoryDoc> {
    await this.ensureSystemCategories();
    const doc = await AnalyticsCategoryModel.findOne({
      isSystem: true,
      slug: UNCATEGORIZED_CATEGORY_SEED.slug,
    }).lean<CategoryDoc | null>();
    if (!doc) {
      throw new Error("No analytics categories available");
    }
    return doc;
  }

  private async loadProjectOptions(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<Record<AnalyticsOptionDimension, CategoryDoc[]>> {
    await this.ensureProjectCategories(userId, apiKeyId);
    const docs = await AnalyticsCategoryModel.find({
      isActive: true,
      isSystem: false,
      apiKeyId,
    })
      .sort({ name: 1 })
      .lean<CategoryDoc[]>();
    const grouped: Record<AnalyticsOptionDimension, CategoryDoc[]> = {
      category: [],
      type: [],
      gap: [],
      answerable: [],
      intent: [],
    };
    for (const doc of docs) {
      const dimension = doc.dimension ?? "category";
      grouped[dimension].push(doc);
    }
    return grouped;
  }

  async listCategoriesForProject(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    dimension?: AnalyticsOptionDimension,
  ): Promise<CategoryDoc[]> {
    const grouped = await this.loadProjectOptions(userId, apiKeyId);
    if (!dimension) {
      return ANALYTICS_OPTION_DIMENSIONS.flatMap((key) => grouped[key]);
    }
    return grouped[dimension];
  }

  /**
   * Enqueue a durable analytics job for a completed widget turn.
   * Idempotent on chatMessageId: does not reset running or done jobs.
   */
  async enqueueAnalyzeCompletedTurn(
    input: AnalyzeCompletedTurnInput,
  ): Promise<void> {
    if (input.executionMode !== "real") {
      logger.info(
        `Skipping analytics enqueue for executionMode=${input.executionMode}`,
        logSource,
        "enqueueAnalyzeCompletedTurn",
      );
      return;
    }

    const existing = await ChatAnalyticsJobModel.findOne({
      chatMessageId: input.userMessageId,
    })
      .select("jobStatus")
      .lean<{ jobStatus: string } | null>();

    if (
      existing &&
      (existing.jobStatus === "running" || existing.jobStatus === "done")
    ) {
      return;
    }

    const now = new Date();
    const $set: Record<string, unknown> = {
      chatSessionId: input.chatSessionId,
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      executionMode: input.executionMode,
      jobStatus: "pending",
      jobAttempts: 0,
      jobClaimedAt: null,
      jobNextAt: now,
      jobLastError: "",
      ...(input.assistantMessageId
        ? { assistantMessageId: input.assistantMessageId }
        : {}),
      ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
    };
    const $unset: Record<string, 1> = {
      ...(!input.assistantMessageId ? { assistantMessageId: 1 } : {}),
      ...(!input.tools || input.tools.length === 0 ? { tools: 1 } : {}),
    };

    await ChatAnalyticsJobModel.updateOne(
      { chatMessageId: input.userMessageId },
      {
        $set,
        $setOnInsert: { chatMessageId: input.userMessageId },
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      },
      { upsert: true },
    );

    kickChatAnalyticsWorker();
  }

  async analyzeCompletedTurn(
    input: AnalyzeCompletedTurnInput,
  ): Promise<void> {
    if (input.executionMode !== "real") {
      logger.info(
        `Skipping analytics for executionMode=${input.executionMode}`,
        logSource,
        "analyzeCompletedTurn",
      );
      return;
    }

    const userMessage = await ChatMessageModel.findById(input.userMessageId)
      .lean<ChatMessageInterface | null>();
    if (!userMessage || userMessage.role !== "user") {
      logger.error(
        `User message not found for analytics: ${input.userMessageId.toString()}`,
        logSource,
        "analyzeCompletedTurn",
      );
      return;
    }

    const existing = await ChatAnalyticsModel.findOne({
      chatMessageId: input.userMessageId,
    })
      .select("_id")
      .lean();
    if (existing) {
      return;
    }

    const priorDocs = await ChatMessageModel.find({
      sessionId: input.chatSessionId,
      createdAt: { $lte: userMessage.createdAt },
    })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean<ChatMessageInterface[]>();

    const contextMessages = [...priorDocs].reverse();
    let assistantText = "";
    if (input.assistantMessageId) {
      const assistant = await ChatMessageModel.findById(
        input.assistantMessageId,
      ).lean<ChatMessageInterface | null>();
      if (assistant) {
        assistantText = textFromMessage(assistant);
      }
    }

    const [options, uncategorized] = await Promise.all([
      this.loadProjectOptions(input.userId, input.apiKeyId),
      this.getUncategorizedCategory(),
    ]);
    const classified = applyToolOutcomeOverride(
      await this.classifyMessage({
        userText: textFromMessage(userMessage),
        assistantText,
        contextMessages,
        categories: options.category,
        types: options.type,
        gaps: options.gap,
        answerables: options.answerable,
        intents: options.intent,
        fallbackCategory: uncategorized,
        tools: input.tools,
      }),
      input.tools,
    );

    const analysis: ChatMessageAnalysis = {
      categoryId: classified.categoryId,
      type: classified.type,
      ...(classified.intent ? { intent: classified.intent } : {}),
      answerable: classified.answerable,
      confidence: classified.confidence,
      gap: classified.gapDetected
        ? {
            detected: true,
            ...(classified.gapType ? { type: classified.gapType } : {}),
            ...(classified.gapReason ? { reason: classified.gapReason } : {}),
          }
        : { detected: false },
      analyzedAt: new Date(),
    };

    const insertDoc = {
      chatMessageId: input.userMessageId,
      chatSessionId: input.chatSessionId,
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      categoryId: classified.categoryId,
      type: classified.type,
      ...(classified.intent ? { intent: classified.intent } : {}),
      answerable: classified.answerable,
      confidence: classified.confidence,
      gapDetected: classified.gapDetected,
      ...(classified.gapType ? { gapType: classified.gapType } : {}),
      ...(classified.gapReason ? { gapReason: classified.gapReason } : {}),
      gapResolved: false,
      messageRole: "user" as const,
      messageCreatedAt: userMessage.createdAt,
    };

    let inserted = false;
    try {
      const upsertResult = await ChatAnalyticsModel.updateOne(
        { chatMessageId: input.userMessageId },
        { $setOnInsert: insertDoc },
        { upsert: true },
      );
      inserted =
        upsertResult.upsertedCount > 0 ||
        (upsertResult.upsertedId !== undefined &&
          upsertResult.upsertedId !== null);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        await ChatMessageModel.updateOne(
          { _id: input.userMessageId },
          { $set: { analysis } },
        );
        return;
      }
      throw error;
    }

    await ChatMessageModel.updateOne(
      { _id: input.userMessageId },
      { $set: { analysis } },
    );

    if (!inserted) {
      return;
    }

    await this.incrementDailyCounters({
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      messageCreatedAt: userMessage.createdAt,
      type: classified.type,
      categoryId: classified.categoryId,
      answerable: classified.answerable,
      gapDetected: classified.gapDetected,
      gapType: classified.gapType,
    });
  }

  private async classifyMessage(params: {
    userText: string;
    assistantText: string;
    contextMessages: ChatMessageInterface[];
    categories: CategoryDoc[];
    types: CategoryDoc[];
    gaps: CategoryDoc[];
    answerables: CategoryDoc[];
    intents: CategoryDoc[];
    fallbackCategory: CategoryDoc;
    tools?: Array<{ name: string; ok: boolean }>;
  }): Promise<ClassifyResult> {
    const uncategorized = params.fallbackCategory;
    const questions: Record<string, LayaChoiceQuestion> = {};
    if (params.categories.length > 0) {
      questions.category = {
        type: "choice",
        instructions: "Which category fits this user message?",
        criteria: choiceCriteria(params.categories),
      };
    }
    if (params.types.length > 0) {
      questions.type = {
        type: "choice",
        instructions: "What kind of message is this?",
        criteria: choiceCriteria(params.types),
      };
    }
    if (params.intents.length > 0) {
      questions.intent = {
        type: "choice",
        instructions: "What did the user want?",
        criteria: choiceCriteria(params.intents),
      };
    }
    if (params.answerables.length > 0) {
      questions.answerable = {
        type: "choice",
        instructions: "Could the agent handle this request?",
        criteria: choiceCriteria(params.answerables),
      };
    }
    if (params.gaps.length > 0) {
      const criteria = choiceCriteria(params.gaps);
      if (!criteria[NO_GAP_SLUG]) {
        criteria[NO_GAP_SLUG] =
          "the agent handled the request and there is no gap";
      }
      questions.gap = {
        type: "choice",
        instructions: "Why could the agent not handle this, if at all?",
        criteria,
      };
    }

    if (Object.keys(questions).length === 0) {
      return {
        categoryId: uncategorized._id,
        type: TYPE_FALLBACK,
        answerable: null,
        confidence: NOTHING_TO_CLASSIFY_CONFIDENCE,
        gapDetected: false,
      };
    }

    const historyLines = params.contextMessages
      .slice(-12)
      .map((message) => `${message.role}: ${textFromMessage(message)}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n");
    const toolsLine =
      params.tools && params.tools.length > 0
        ? params.tools
            .map((tool) => `${tool.name}=${tool.ok ? "ok" : "fail"}`)
            .join(", ")
        : "(none)";

    try {
      const result = await layaClient.predict({
        state: {
          userMessage: params.userText || "(empty)",
          assistantReply: params.assistantText || "(none)",
          conversation: historyLines || "(none)",
          tools: toolsLine,
        },
        questions,
      });
      return classificationFromAnswers(
        result.answers,
        params,
        uncategorized,
      );
    } catch (error) {
      logger.error(
        error instanceof Error
          ? error.message
          : "Chat analytics classification failed",
        logSource,
        "classifyMessage",
      );
      return {
        categoryId: uncategorized._id,
        type: TYPE_FALLBACK,
        answerable: null,
        confidence: CLASSIFY_FAILURE_CONFIDENCE,
        gapDetected: false,
      };
    }
  }

  private async incrementDailyCounters(params: {
    userId: Types.ObjectId;
    apiKeyId: Types.ObjectId;
    messageCreatedAt: Date;
    type: MessageAnalyticsType;
    categoryId: Types.ObjectId;
    answerable: boolean | null;
    gapDetected: boolean;
    gapType?: AnalyticsGapType;
  }): Promise<void> {
    const date = utcDayStart(params.messageCreatedAt);
    const inc: Record<string, number> = {
      totalMessages: 1,
      [`byType.${params.type}`]: 1,
      [`byCategoryId.${params.categoryId.toString()}`]: 1,
    };
    if (params.answerable === true) {
      inc.answerableCount = 1;
    } else if (params.answerable === false) {
      inc.unanswerableCount = 1;
    }
    if (params.gapDetected) {
      inc.gapCount = 1;
      if (params.gapType) {
        inc[`byGapType.${params.gapType}`] = 1;
      }
    }

    await ChatAnalyticsDailyModel.updateOne(
      {
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        date,
      },
      {
        $inc: inc,
        $setOnInsert: {
          userId: params.userId,
          apiKeyId: params.apiKeyId,
          date,
        },
      },
      { upsert: true },
    );
  }

  async getSummary(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<ChatAnalyticsSummaryOutDto> {
    const range = await entitlementService.resolveAnalyticsDateRange(
      userId,
      apiKeyId,
      from,
      to,
    );

    const fromDay = utcDayStart(range.from);
    const toDay = utcDayStart(range.to);

    const days = await ChatAnalyticsDailyModel.find({
      apiKeyId,
      date: { $gte: fromDay, $lte: toDay },
    }).lean();

    const byType: Record<string, number> = {};
    const byCategoryId: Record<string, number> = {};
    const byGapType: Record<string, number> = {};
    let totalMessages = 0;
    let answerableCount = 0;
    let unanswerableCount = 0;

    for (const day of days) {
      totalMessages += day.totalMessages ?? 0;
      answerableCount += day.answerableCount ?? 0;
      unanswerableCount += day.unanswerableCount ?? 0;
      for (const [key, value] of Object.entries(mapToRecord(day.byType))) {
        byType[key] = (byType[key] ?? 0) + value;
      }
      for (const [key, value] of Object.entries(mapToRecord(day.byCategoryId))) {
        byCategoryId[key] = (byCategoryId[key] ?? 0) + value;
      }
      for (const [key, value] of Object.entries(mapToRecord(day.byGapType))) {
        byGapType[key] = (byGapType[key] ?? 0) + value;
      }
    }

    const knowledgeGapFilter = {
      apiKeyId,
      messageCreatedAt: { $gte: range.from, $lte: range.to },
      gapDetected: true,
      gapType: { $in: [...KNOWLEDGE_GAP_TYPES] },
    };
    const [gapCount, resolvedGapCount] = await Promise.all([
      ChatAnalyticsModel.countDocuments({
        ...knowledgeGapFilter,
        gapResolved: { $ne: true },
      }),
      ChatAnalyticsModel.countDocuments({
        ...knowledgeGapFilter,
        gapResolved: true,
      }),
    ]);

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      lookbackDays: range.lookbackDays,
      totalMessages,
      answerableCount,
      unanswerableCount,
      gapCount,
      resolvedGapCount,
      byType,
      byCategoryId,
      byGapType,
    };
  }

  async getTrends(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    options: {
      from?: Date;
      to?: Date;
      dimension?: "category" | "gapType" | "type";
      limit?: number;
    } = {},
  ): Promise<ChatAnalyticsTrendsOutDto> {
    const range = await entitlementService.resolveAnalyticsDateRange(
      userId,
      apiKeyId,
      options.from,
      options.to,
    );

    const dimension = options.dimension ?? "category";
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 30);

    const fromDay = utcDayStart(range.from);
    const toDay = utcDayStart(range.to);
    const dates: string[] = [];
    for (
      let cursor = new Date(fromDay);
      cursor.getTime() <= toDay.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dates.push(cursor.toISOString());
    }

    const days = await ChatAnalyticsDailyModel.find({
      apiKeyId,
      date: { $gte: fromDay, $lte: toDay },
    })
      .sort({ date: 1 })
      .lean();

    const dayByIso = new Map(
      days.map((day) => [utcDayStart(day.date).toISOString(), day] as const),
    );

    const totals = new Map<string, number>();
    let totalMessages = 0;

    for (const dateIso of dates) {
      const day = dayByIso.get(dateIso);
      if (!day) continue;
      totalMessages += day.totalMessages ?? 0;
      const bucket =
        dimension === "category"
          ? mapToRecord(day.byCategoryId)
          : dimension === "gapType"
            ? mapToRecord(day.byGapType)
            : mapToRecord(day.byType);
      for (const [key, value] of Object.entries(bucket)) {
        totals.set(key, (totals.get(key) ?? 0) + value);
      }
    }

    const topKeys = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key);

    let labelByKey = new Map<string, string>();
    if (dimension === "category" && topKeys.length > 0) {
      const categories = await AnalyticsCategoryModel.find({
        _id: {
          $in: topKeys
            .filter((key) => Types.ObjectId.isValid(key))
            .map((key) => new Types.ObjectId(key)),
        },
      })
        .select("name")
        .lean<Array<{ _id: Types.ObjectId; name: string }>>();
      labelByKey = new Map(
        categories.map((c) => [c._id.toString(), c.name] as const),
      );
    } else if (dimension === "gapType" || dimension === "type") {
      const optionDimension = dimension === "gapType" ? "gap" : "type";
      const options = await AnalyticsCategoryModel.find({
        apiKeyId,
        isSystem: false,
        dimension: optionDimension,
        slug: { $in: topKeys },
      })
        .select("slug name")
        .lean<Array<{ slug: string; name: string }>>();
      labelByKey = new Map(options.map((option) => [option.slug, option.name]));
    }

    const series = topKeys.map((key) => {
      const points = dates.map((dateIso) => {
        const day = dayByIso.get(dateIso);
        if (!day) return 0;
        const bucket =
          dimension === "category"
            ? mapToRecord(day.byCategoryId)
            : dimension === "gapType"
              ? mapToRecord(day.byGapType)
              : mapToRecord(day.byType);
        return bucket[key] ?? 0;
      });
      const total = totals.get(key) ?? 0;
      return {
        key,
        label: labelByKey.get(key) ?? key,
        total,
        sharePercent:
          totalMessages > 0
            ? Math.round((total / totalMessages) * 1000) / 10
            : 0,
        points,
      };
    });

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      lookbackDays: range.lookbackDays,
      dimension,
      dates,
      totalMessages,
      series,
    };
  }

  async listRecords(
    userId: Types.ObjectId,
    params: {
      apiKeyId: Types.ObjectId;
      from?: Date;
      to?: Date;
      categoryId?: Types.ObjectId;
      type?: MessageAnalyticsType;
      answerable?: boolean;
      gapDetected?: boolean;
      gapResolved?: boolean;
      gapType?: AnalyticsGapType;
      gapGroup?: AnalyticsGapGroup;
      chatSessionId?: Types.ObjectId;
      page: number;
      pageSize: number;
    },
  ): Promise<ChatAnalyticsRecordsPageOutDto> {
    const range = await entitlementService.resolveAnalyticsDateRange(
      userId,
      params.apiKeyId,
      params.from,
      params.to,
    );

    const filter: Record<string, unknown> = {
      apiKeyId: params.apiKeyId,
      messageCreatedAt: { $gte: range.from, $lte: range.to },
    };
    if (params.categoryId) filter.categoryId = params.categoryId;
    if (params.type) filter.type = params.type;
    if (params.answerable !== undefined) filter.answerable = params.answerable;
    if (params.gapDetected !== undefined) filter.gapDetected = params.gapDetected;
    if (params.gapResolved === true) {
      filter.gapResolved = true;
    } else if (params.gapResolved === false) {
      filter.gapResolved = { $ne: true };
    }
    if (params.gapType) {
      filter.gapType = params.gapType;
    } else if (params.gapGroup === "knowledge") {
      filter.gapType = { $in: [...KNOWLEDGE_GAP_TYPES] };
    } else if (params.gapGroup === "failure") {
      filter.gapType = { $nin: [...KNOWLEDGE_GAP_TYPES] };
    }
    if (params.chatSessionId) filter.chatSessionId = params.chatSessionId;

    const skip = (params.page - 1) * params.pageSize;
    const [total, docs] = await Promise.all([
      ChatAnalyticsModel.countDocuments(filter),
      ChatAnalyticsModel.find(filter)
        .sort({ messageCreatedAt: -1 })
        .skip(skip)
        .limit(params.pageSize)
        .lean<AnalyticsDoc[]>(),
    ]);

    const categoryIds = [...new Set(docs.map((d) => d.categoryId.toString()))];
    const categories = categoryIds.length
      ? await AnalyticsCategoryModel.find({
          _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) },
        })
          .select("name")
          .lean<Array<{ _id: Types.ObjectId; name: string }>>()
      : [];
    const nameById = new Map(
      categories.map((c) => [c._id.toString(), c.name] as const),
    );

    return {
      items: docs.map((doc) =>
        toRecordOutDto(doc, nameById.get(doc.categoryId.toString())),
      ),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async resolveGap(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<ChatAnalyticsRecordOutDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Analytics record not found");
    }
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const doc = await ChatAnalyticsModel.findOne({
      _id: new Types.ObjectId(id),
      apiKeyId,
    });
    if (!doc) {
      throw new Error("Analytics record not found");
    }
    if (!doc.gapDetected) {
      throw new Error("Analytics record has no gap");
    }
    if (!isKnowledgeGapType(doc.gapType)) {
      throw new Error("Only knowledge gaps can be resolved");
    }
    if (doc.gapResolved === true) {
      const category = await AnalyticsCategoryModel.findById(doc.categoryId)
        .select("name")
        .lean<{ name: string } | null>();
      return toRecordOutDto(
        doc.toObject() as AnalyticsDoc,
        category?.name,
      );
    }

    const now = new Date();
    doc.gapResolved = true;
    doc.gapResolvedAt = now;
    doc.gapResolvedBy = userId;
    await doc.save();

    await ChatMessageModel.updateOne(
      { _id: doc.chatMessageId, "analysis.gap": { $exists: true } },
      {
        $set: {
          "analysis.gap.resolved": true,
          "analysis.gap.resolvedAt": now,
        },
      },
    );

    const category = await AnalyticsCategoryModel.findById(doc.categoryId)
      .select("name")
      .lean<{ name: string } | null>();
    return toRecordOutDto(doc.toObject() as AnalyticsDoc, category?.name);
  }

  async getRecord(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<ChatAnalyticsRecordOutDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Analytics record not found");
    }
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const doc = await ChatAnalyticsModel.findOne({
      _id: new Types.ObjectId(id),
      apiKeyId,
    }).lean<AnalyticsDoc | null>();
    if (!doc) {
      throw new Error("Analytics record not found");
    }

    const lookbackDays = await entitlementService.getAnalyticsLookbackDays(
      userId,
      apiKeyId,
    );
    const earliest = new Date();
    earliest.setUTCHours(0, 0, 0, 0);
    earliest.setUTCDate(earliest.getUTCDate() - (lookbackDays - 1));
    if (doc.messageCreatedAt.getTime() < earliest.getTime()) {
      throw new Error(
        `Analytics lookback is limited to ${lookbackDays} days on your plan`,
      );
    }

    const category = await AnalyticsCategoryModel.findById(doc.categoryId)
      .select("name")
      .lean<{ name: string } | null>();
    return toRecordOutDto(doc, category?.name);
  }

  async getConversation(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionId: string,
  ): Promise<ChatAnalyticsConversationOutDto> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new Error("Chat session not found");
    }
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const chatSessionId = new Types.ObjectId(sessionId);
    const owned = await ChatAnalyticsModel.exists({
      chatSessionId,
      apiKeyId,
    });
    if (!owned) {
      throw new Error("Chat session not found");
    }

    const lookbackDays = await entitlementService.getAnalyticsLookbackDays(
      userId,
      apiKeyId,
    );
    const earliest = new Date();
    earliest.setUTCHours(0, 0, 0, 0);
    earliest.setUTCDate(earliest.getUTCDate() - (lookbackDays - 1));

    const docs = await ChatMessageModel.find({
      sessionId: chatSessionId,
      role: { $in: ["user", "assistant"] },
      createdAt: { $gte: earliest },
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean<ChatMessageInterface[]>();

    const messages = docs
      .map((doc) => {
        const text = textFromMessage(doc).trim();
        if (!text) return null;
        if (doc.role !== "user" && doc.role !== "assistant") return null;
        const analysis = doc.analysis
          ? {
              ...(doc.analysis.categoryId
                ? { categoryId: doc.analysis.categoryId.toString() }
                : {}),
              type: doc.analysis.type,
              ...(doc.analysis.intent ? { intent: doc.analysis.intent } : {}),
              answerable: doc.analysis.answerable,
              confidence: doc.analysis.confidence,
              gapDetected: doc.analysis.gap?.detected === true,
              ...(doc.analysis.gap?.type
                ? { gapType: doc.analysis.gap.type }
                : {}),
              ...(doc.analysis.gap?.reason
                ? { gapReason: doc.analysis.gap.reason }
                : {}),
              ...(doc.analysis.gap?.resolved === true
                ? { gapResolved: true }
                : {}),
            }
          : null;
        return {
          id: doc._id.toString(),
          role: doc.role,
          text,
          createdAt: doc.createdAt.toISOString(),
          analysis,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return {
      chatSessionId: sessionId,
      conversationId: sessionId,
      messages,
    };
  }

  async listCategories(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    dimension?: AnalyticsOptionDimension,
  ): Promise<AnalyticsCategoryOutDto[]> {
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);
    const docs = await this.listCategoriesForProject(
      userId,
      apiKeyId,
      dimension,
    );
    return docs.map(toCategoryOutDto);
  }

  async createCategory(
    userId: Types.ObjectId,
    input: CreateAnalyticsCategoryDto,
  ): Promise<AnalyticsCategoryOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const slug = (input.slug ?? input.name).trim().toLowerCase();
    const dimension = input.dimension ?? "category";

    try {
      const created = await AnalyticsCategoryModel.create({
        name: input.name.trim(),
        slug,
        description: input.description,
        dimension,
        isSystem: false,
        userId,
        apiKeyId,
        isActive: true,
      });
      return toCategoryOutDto(created.toObject() as CategoryDoc);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new Error("Category slug already exists");
      }
      throw error;
    }
  }

  async updateCategory(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
    patch: UpdateAnalyticsCategoryDto,
  ): Promise<AnalyticsCategoryOutDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Analytics category not found");
    }
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const category = await AnalyticsCategoryModel.findOne({
      _id: new Types.ObjectId(id),
      apiKeyId,
      isSystem: false,
    });
    if (!category) {
      throw new Error("Analytics category not found");
    }

    if (patch.name !== undefined) category.name = patch.name;
    if (patch.description !== undefined) category.description = patch.description;
    if (patch.isActive !== undefined) category.isActive = patch.isActive;
    await category.save();
    return toCategoryOutDto(category.toObject() as CategoryDoc);
  }

  async deleteCategory(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Analytics category not found");
    }
    await entitlementService.resolveAnalyticsDateRange(userId, apiKeyId);

    const updated = await AnalyticsCategoryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        apiKeyId,
        isSystem: false,
      },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!updated) {
      throw new Error("Analytics category not found");
    }
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await ChatAnalyticsModel.deleteMany({ apiKeyId });
    await ChatAnalyticsDailyModel.deleteMany({ apiKeyId });
    await ChatAnalyticsJobModel.deleteMany({ apiKeyId });
    // System seeds use apiKeyId: null   this only removes tenant categories.
    await AnalyticsCategoryModel.deleteMany({ apiKeyId });
  }

  /**
   * Rebuild daily projection for a date range from ChatAnalytics records.
   */
  async rebuildDaily(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<void> {
    const fromDay = utcDayStart(from);
    const toDay = utcDayStart(to);

    await ChatAnalyticsDailyModel.deleteMany({
      apiKeyId,
      date: { $gte: fromDay, $lte: toDay },
    });

    const records = await ChatAnalyticsModel.find({
      apiKeyId,
      messageCreatedAt: {
        $gte: fromDay,
        $lte: new Date(toDay.getTime() + 24 * 60 * 60 * 1000 - 1),
      },
    }).lean<AnalyticsDoc[]>();

    for (const record of records) {
      await this.incrementDailyCounters({
        userId,
        apiKeyId,
        messageCreatedAt: record.messageCreatedAt,
        type: record.type,
        categoryId: record.categoryId,
        answerable: record.answerable,
        gapDetected: record.gapDetected,
        gapType: record.gapType,
      });
    }
  }
}

export const chatAnalyticsService = new ChatAnalyticsService();

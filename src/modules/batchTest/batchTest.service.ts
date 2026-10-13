import crypto from "crypto";
import { Types } from "mongoose";
import type { AgentInfluenceDto } from "../../dto/agent.dto";
import type {
  BatchTestGroupDetailOutDto,
  BatchTestGroupOutDto,
  BatchTestGroupProgressOutDto,
  BatchTestGroupSummaryDto,
  BatchTestQuestionOutDto,
  CreateBatchTestGroupDto,
  CreateBatchTestQuestionDto,
  SetBatchTestRatingDto,
  UpdateBatchTestGroupDto,
  UpdateBatchTestQuestionDto,
} from "../../dto/batchTest.dto";
import { logger } from "../../logger/logger";
import { ollamaClient, OLLAMA_CHAT_MODEL } from "../../llm/ollama/ollamaClient";
import {
  BatchTestGroupModel,
} from "../../models/batchTest/batchTestGroup.model";
import type { BatchTestGroupInterface } from "../../models/batchTest/batchTestGroup.interface";
import {
  BatchTestQuestionModel,
} from "../../models/batchTest/batchTestQuestion.model";
import type {
  BatchTestAnswerability,
  BatchTestQuestionInterface,
  BatchTestQuestionReferences,
} from "../../models/batchTest/batchTestQuestion.interface";
import {
  acquireSyncLockOrThrow,
  refreshSyncLock,
  releaseSyncLock,
} from "../../locks/syncLock";
import { agentService } from "../agent/agent.service";
import { entitlementService } from "../entitlement/entitlement.service";
import { guidanceService } from "../guidance/guidance.service";

const logSource = "modules/batchTest/batchTest.service.ts";
const QUESTION_TIMEOUT_MS = 3 * 60 * 1000;
const QUESTION_TIMEOUT_MESSAGE = "Question timed out after 3 minutes";

type GroupDoc = BatchTestGroupInterface & { _id: Types.ObjectId };
type QuestionDoc = BatchTestQuestionInterface & { _id: Types.ObjectId };

const emptyReferences = (): BatchTestQuestionReferences => ({
  topics: [],
  articles: [],
  chunks: [],
});

const emptyResultFields = () => ({
  answer: null as string | null,
  answerability: null as BatchTestAnswerability | null,
  error: null as string | null,
  references: emptyReferences(),
  toolsDeclared: [] as QuestionDoc["toolsDeclared"],
  toolsCalled: [] as QuestionDoc["toolsCalled"],
  guidanceDeclared: [] as QuestionDoc["guidanceDeclared"],
  guidanceUsed: [] as QuestionDoc["guidanceUsed"],
  execution: {
    runId: null as string | null,
    startedAt: null as Date | null,
    finishedAt: null as Date | null,
  },
  rating: null as QuestionDoc["rating"],
});

function toQuestionOutDto(doc: QuestionDoc): BatchTestQuestionOutDto {
  return {
    id: doc._id.toString(),
    groupId: doc.groupId.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    questionText: doc.questionText,
    order: doc.order,
    status: doc.status,
    answer: doc.answer,
    answerability: doc.answerability,
    error: doc.error,
    references: {
      topics: doc.references?.topics ?? [],
      articles: doc.references?.articles ?? [],
      chunks: doc.references?.chunks ?? [],
    },
    toolsDeclared: doc.toolsDeclared ?? [],
    toolsCalled: doc.toolsCalled ?? [],
    guidanceDeclared: doc.guidanceDeclared ?? [],
    guidanceUsed: doc.guidanceUsed ?? [],
    execution: {
      runId: doc.execution?.runId ?? null,
      startedAt: doc.execution?.startedAt
        ? doc.execution.startedAt.toISOString()
        : null,
      finishedAt: doc.execution?.finishedAt
        ? doc.execution.finishedAt.toISOString()
        : null,
    },
    rating: doc.rating,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const emptyGroupSummary = (): BatchTestGroupSummaryDto => ({
  answerable: 0,
  notAnswerable: 0,
  good: 0,
  passable: 0,
  poor: 0,
});

function summarizeQuestions(
  questions: Array<{
    answerability?: BatchTestAnswerability | null;
    rating?: QuestionDoc["rating"];
  }>,
): BatchTestGroupSummaryDto {
  const summary = emptyGroupSummary();
  for (const question of questions) {
    if (question.answerability === "answerable") summary.answerable += 1;
    else if (question.answerability === "not_answerable") {
      summary.notAnswerable += 1;
    }
    if (question.rating === "good") summary.good += 1;
    else if (question.rating === "passable") summary.passable += 1;
    else if (question.rating === "poor") summary.poor += 1;
  }
  return summary;
}

function toGroupOutDto(
  doc: GroupDoc,
  questionCount: number,
  summary: BatchTestGroupSummaryDto,
): BatchTestGroupOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    name: doc.name,
    runStatus: doc.runStatus,
    progress: {
      total: doc.progress?.total ?? 0,
      completed: doc.progress?.completed ?? 0,
      failed: doc.progress?.failed ?? 0,
    },
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
    latestRunId: doc.latestRunId,
    questionCount,
    summary,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function classifyAnswerabilityHeuristic(
  answer: string,
  influence: AgentInfluenceDto,
): BatchTestAnswerability {
  const hasKnowledge =
    influence.chunks.length > 0 ||
    influence.topics.length > 0 ||
    influence.articles.length > 0 ||
    influence.tools.some((tool) => tool.ok);

  const lowered = answer.toLowerCase();
  const unsure =
    /\bi don'?t know\b/.test(lowered) ||
    /\bi do not know\b/.test(lowered) ||
    /\bnot enough (information|context|knowledge)\b/.test(lowered) ||
    /\bcannot (find|answer|determine)\b/.test(lowered) ||
    /\bunable to (find|answer|determine)\b/.test(lowered) ||
    /\bnot (mentioned|available|found|supported)\b/.test(lowered) ||
    /\bno (information|mention|details)\b/.test(lowered) ||
    /\bcould not find\b/.test(lowered) ||
    /\bbased on the (information|documents|context) (provided|available)\b/.test(
      lowered,
    ) ||
    /\btidak (disebutkan|tersedia|ditemukan|didukung)\b/.test(lowered) ||
    /\btidak ada (informasi|penyebutan|detail)\b/.test(lowered) ||
    /\bberdasarkan informasi yang (tersedia|diberikan)\b/.test(lowered);

  if (!hasKnowledge || unsure) {
    return "not_answerable";
  }
  return "answerable";
}

async function classifyAnswerability(
  question: string,
  answer: string,
  influence: AgentInfluenceDto,
  signal?: AbortSignal,
): Promise<BatchTestAnswerability> {
  const fallback = classifyAnswerabilityHeuristic(answer, influence);

  try {
    const docsRetrieved =
      influence.chunks.length > 0 ||
      influence.topics.length > 0 ||
      influence.articles.length > 0 ||
      influence.tools.some((tool) => tool.ok);

    const result = await ollamaClient.chatTurn(
      [
        {
          role: "system",
          content:
            'Classify whether the agent answered the user\'s question with the information they asked for. Reply with exactly one JSON object: {"answerability":"answerable"} or {"answerability":"not_answerable"}. Use answerable only when the reply provides the requested facts, steps, or how-to from knowledge. Use not_answerable when the knowledge does not cover the topic, the feature is not mentioned/not available, the agent only redirects to support/another channel, admits it cannot answer, or the answer is empty/evasive   even if documents were retrieved.',
        },
        {
          role: "user",
          content: `Question:\n${question}\n\nAgent answer:\n${answer}\n\nDocuments retrieved: ${docsRetrieved ? "yes" : "no"}\nChunks: ${influence.chunks.length}\nTools called ok: ${influence.tools.filter((t) => t.ok).length}`,
        },
      ],
      {
        name: OLLAMA_CHAT_MODEL,
        provider: "ollama",
        temperature: 0,
        think: true,
      },
      [],
      signal,
    );

    const match = result.text.match(
      /"answerability"\s*:\s*"(answerable|not_answerable)"/,
    );
    if (match?.[1] === "answerable" || match?.[1] === "not_answerable") {
      if (fallback === "not_answerable" && match[1] === "answerable") {
        return "not_answerable";
      }
      return match[1];
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    const message =
      error instanceof Error ? error.message : "answerability classification failed";
    logger.warn(message, logSource, "classifyAnswerability");
  }

  return fallback;
}

function withQuestionTimeout<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error(QUESTION_TIMEOUT_MESSAGE));
  }
  const timeout = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error(QUESTION_TIMEOUT_MESSAGE)),
      { once: true },
    );
  });
  const workPromise = work();
  void workPromise.catch(() => undefined);
  void timeout.catch(() => undefined);
  return Promise.race([workPromise, timeout]);
}

export class BatchTestService {
  /** One executing batch per API key. Later starts stay queued until the tail reaches them. */
  private readonly runTails = new Map<string, Promise<void>>();

  private scheduleRun(
    apiKeyId: Types.ObjectId,
    job: () => Promise<void>,
  ): void {
    const key = apiKeyId.toString();
    const prev = this.runTails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    void next.catch(() => undefined);
    this.runTails.set(key, next);
  }

  async listGroups(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<BatchTestGroupOutDto[]> {
    const groups = await BatchTestGroupModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<GroupDoc[]>();

    if (groups.length === 0) {
      return [];
    }

    const counts = await BatchTestQuestionModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
      answerable: number;
      notAnswerable: number;
      good: number;
      passable: number;
      poor: number;
    }>([
      {
        $match: {
          groupId: { $in: groups.map((g) => g._id) },
          apiKeyId,
        },
      },
      {
        $group: {
          _id: "$groupId",
          count: { $sum: 1 },
          answerable: {
            $sum: { $cond: [{ $eq: ["$answerability", "answerable"] }, 1, 0] },
          },
          notAnswerable: {
            $sum: {
              $cond: [{ $eq: ["$answerability", "not_answerable"] }, 1, 0],
            },
          },
          good: { $sum: { $cond: [{ $eq: ["$rating", "good"] }, 1, 0] } },
          passable: {
            $sum: { $cond: [{ $eq: ["$rating", "passable"] }, 1, 0] },
          },
          poor: { $sum: { $cond: [{ $eq: ["$rating", "poor"] }, 1, 0] } },
        },
      },
    ]);
    const countByGroup = new Map(counts.map((row) => [row._id.toString(), row]));

    return groups.map((group) => {
      const row = countByGroup.get(group._id.toString());
      return toGroupOutDto(group, row?.count ?? 0, {
        answerable: row?.answerable ?? 0,
        notAnswerable: row?.notAnswerable ?? 0,
        good: row?.good ?? 0,
        passable: row?.passable ?? 0,
        poor: row?.poor ?? 0,
      });
    });
  }

  async createGroup(
    userId: Types.ObjectId,
    input: CreateBatchTestGroupDto,
  ): Promise<BatchTestGroupOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const allowed = await entitlementService.canCreateBatchTestGroup(
      userId,
      apiKeyId,
    );
    if (!allowed) {
      throw new Error("Batch test group limit reached for your plan");
    }

    const doc = await BatchTestGroupModel.create({
      userId,
      apiKeyId,
      name: input.name,
      runStatus: "idle",
      progress: { total: 0, completed: 0, failed: 0 },
      lastRunAt: null,
      latestRunId: null,
    });

    return toGroupOutDto(doc.toObject() as GroupDoc, 0, emptyGroupSummary());
  }

  async getGroup(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
  ): Promise<BatchTestGroupDetailOutDto> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    const questions = await BatchTestQuestionModel.find({
      groupId: group._id,
      apiKeyId,
    })
      .sort({ order: 1, createdAt: 1 })
      .lean<QuestionDoc[]>();

    return {
      ...toGroupOutDto(group, questions.length, summarizeQuestions(questions)),
      questions: questions.map(toQuestionOutDto),
    };
  }

  async updateGroup(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    input: UpdateBatchTestGroupDto,
  ): Promise<BatchTestGroupOutDto> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    const updated = await BatchTestGroupModel.findOneAndUpdate(
      { _id: group._id, apiKeyId },
      { $set: { name: input.name } },
      { new: true },
    ).lean<GroupDoc>();
    if (!updated) {
      throw new Error("Batch test group not found");
    }
    const questionCount = await BatchTestQuestionModel.countDocuments({
      groupId: group._id,
      apiKeyId,
    });
    return toGroupOutDto(updated, questionCount, emptyGroupSummary());
  }

  async deleteGroup(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
  ): Promise<void> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    await BatchTestQuestionModel.deleteMany({
      groupId: group._id,
      apiKeyId,
    });
    await BatchTestGroupModel.deleteOne({ _id: group._id });
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await BatchTestQuestionModel.deleteMany({ apiKeyId });
    await BatchTestGroupModel.deleteMany({ apiKeyId });
  }

  async addQuestion(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    input: CreateBatchTestQuestionDto,
  ): Promise<BatchTestQuestionOutDto> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    if (group.runStatus === "queued" || group.runStatus === "running") {
      throw new Error("Batch test group is already running");
    }

    const allowed = await entitlementService.canAddBatchTestQuestion(
      userId,
      apiKeyId,
      group._id,
    );
    if (!allowed) {
      throw new Error("Questions per batch test group limit reached for your plan");
    }

    const last = await BatchTestQuestionModel.findOne({
      groupId: group._id,
      apiKeyId,
    })
      .sort({ order: -1 })
      .select("order")
      .lean<{ order: number } | null>();

    const doc = await BatchTestQuestionModel.create({
      groupId: group._id,
      userId,
      apiKeyId,
      questionText: input.questionText,
      order: (last?.order ?? -1) + 1,
      status: "idle",
      ...emptyResultFields(),
    });

    return toQuestionOutDto(doc.toObject() as QuestionDoc);
  }

  async updateQuestion(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    questionId: string,
    input: UpdateBatchTestQuestionDto,
  ): Promise<BatchTestQuestionOutDto> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    if (group.runStatus === "queued" || group.runStatus === "running") {
      throw new Error("Batch test group is already running");
    }

    const existing = await this.findOwnedQuestion(
      userId,
      apiKeyId,
      group._id,
      questionId,
    );

    const textChanged = existing.questionText !== input.questionText;
    const updated = await BatchTestQuestionModel.findOneAndUpdate(
      { _id: existing._id, apiKeyId, groupId: group._id },
      {
        $set: {
          questionText: input.questionText,
          ...(textChanged
            ? { status: "idle", ...emptyResultFields() }
            : {}),
        },
      },
      { new: true },
    ).lean<QuestionDoc>();

    if (!updated) {
      throw new Error("Batch test question not found");
    }
    return toQuestionOutDto(updated);
  }

  async deleteQuestions(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    questionIds: string[],
  ): Promise<void> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    if (group.runStatus === "queued" || group.runStatus === "running") {
      throw new Error("Batch test group is already running");
    }

    const objectIds = await this.resolveOwnedQuestionIds(
      userId,
      apiKeyId,
      group._id,
      questionIds,
    );

    await BatchTestQuestionModel.deleteMany({
      _id: { $in: objectIds },
      groupId: group._id,
      apiKeyId,
    });
  }

  async setRating(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    questionId: string,
    input: SetBatchTestRatingDto,
  ): Promise<BatchTestQuestionOutDto> {
    const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
    const existing = await this.findOwnedQuestion(
      userId,
      apiKeyId,
      group._id,
      questionId,
    );
    if (existing.status !== "completed") {
      throw new Error("Only completed questions can be rated");
    }

    const updated = await BatchTestQuestionModel.findOneAndUpdate(
      { _id: existing._id, apiKeyId, groupId: group._id },
      { $set: { rating: input.rating } },
      { new: true },
    ).lean<QuestionDoc>();
    if (!updated) {
      throw new Error("Batch test question not found");
    }
    return toQuestionOutDto(updated);
  }

  async getProgress(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
  ): Promise<BatchTestGroupProgressOutDto> {
    const detail = await this.getGroup(userId, apiKeyId, groupId);
    return {
      id: detail.id,
      runStatus: detail.runStatus,
      progress: detail.progress,
      lastRunAt: detail.lastRunAt,
      latestRunId: detail.latestRunId,
      questions: detail.questions,
    };
  }

  async runQuestions(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
    questionIds: string[],
  ): Promise<BatchTestGroupDetailOutDto> {
    const lockKey = `batch-test-run:${groupId}`;
    await acquireSyncLockOrThrow(
      lockKey,
      "Batch test group is already running",
    );

    let scheduled = false;
    try {
      const group = await this.findOwnedGroup(userId, apiKeyId, groupId);
      if (group.runStatus === "queued" || group.runStatus === "running") {
        throw new Error("Batch test group is already running");
      }

      const ownedIds = await this.resolveOwnedQuestionIds(
        userId,
        apiKeyId,
        group._id,
        questionIds,
      );
      if (ownedIds.length === 0) {
        throw new Error("questionIds must not be empty");
      }

      const runId = crypto.randomUUID();
      await BatchTestQuestionModel.updateMany(
        {
          _id: { $in: ownedIds },
          groupId: group._id,
          apiKeyId,
        },
        {
          $set: {
            status: "pending",
            ...emptyResultFields(),
          },
        },
      );

      await BatchTestGroupModel.updateOne(
        { _id: group._id },
        {
          $set: {
            runStatus: "queued",
            latestRunId: runId,
            progress: {
              total: ownedIds.length,
              completed: 0,
              failed: 0,
            },
          },
        },
      );

      this.scheduleRun(apiKeyId, () =>
        this.processRun(userId, apiKeyId, group._id, runId, ownedIds, lockKey),
      );
      scheduled = true;

      return this.getGroup(userId, apiKeyId, groupId);
    } catch (error) {
      if (!scheduled) {
        await releaseSyncLock(lockKey).catch(() => undefined);
      }
      throw error;
    }
  }

  /** Fail runs left queued or running by a dead process. */
  async releaseStuckRuns(): Promise<void> {
    const stuck = await BatchTestGroupModel.find({
      runStatus: { $in: ["queued", "running"] },
    })
      .select("_id")
      .lean<Array<{ _id: Types.ObjectId }>>();

    if (stuck.length === 0) return;

    const groupIds = stuck.map((group) => group._id);
    const now = new Date();

    await BatchTestQuestionModel.updateMany(
      {
        groupId: { $in: groupIds },
        status: { $in: ["pending", "running"] },
      },
      {
        $set: {
          status: "failed",
          error: "Interrupted by server restart",
          "execution.finishedAt": now,
        },
      },
    );

    await BatchTestGroupModel.updateMany(
      { _id: { $in: groupIds } },
      {
        $set: {
          runStatus: "failed",
          lastRunAt: now,
        },
      },
    );

    logger.info(
      `Released ${groupIds.length} stuck batch test run(s)`,
      logSource,
      "releaseStuckRuns",
    );
  }

  private async processRun(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: Types.ObjectId,
    runId: string,
    questionIds: Types.ObjectId[],
    lockKey: string,
  ): Promise<void> {
    try {
      const claimed = await BatchTestGroupModel.findOneAndUpdate(
        {
          _id: groupId,
          apiKeyId,
          latestRunId: runId,
          runStatus: "queued",
        },
        { $set: { runStatus: "running" } },
        { new: true },
      ).lean<GroupDoc>();

      if (!claimed) {
        return;
      }

      let completed = 0;
      let failed = 0;

      for (const questionId of questionIds) {
        await refreshSyncLock(lockKey).catch(() => undefined);

        const stillCurrent = await BatchTestGroupModel.exists({
          _id: groupId,
          latestRunId: runId,
        });
        if (!stillCurrent) {
          return;
        }

        const startedAt = new Date();
        await BatchTestQuestionModel.updateOne(
          { _id: questionId, groupId, apiKeyId },
          {
            $set: {
              status: "running",
              execution: {
                runId,
                startedAt,
                finishedAt: null,
              },
            },
          },
        );

        try {
          const question = await BatchTestQuestionModel.findOne({
            _id: questionId,
            groupId,
            apiKeyId,
          }).lean<QuestionDoc>();
          if (!question) {
            failed += 1;
            await this.bumpProgress(groupId, runId, completed, failed);
            continue;
          }

          const declaredGuidance = await guidanceService.listEnabledForAgent(
            apiKeyId,
          );
          const guidanceDeclared = declaredGuidance.map((g) => ({
            id: g.id,
            name: g.title,
          }));

          logger.info(
            `Batch question ${questionId.toString()} starting agent turn`,
            logSource,
            "processRun",
          );

          const signal = AbortSignal.timeout(QUESTION_TIMEOUT_MS);
          const outcome = await withQuestionTimeout(signal, async () => {
            let answer = "";
            let influence: AgentInfluenceDto | null = null;

            for await (const event of agentService.runIsolatedAgentTurn({
              userId,
              apiKeyId,
              message: question.questionText,
              signal,
            })) {
              if (event.type === "token") {
                answer += event.text;
              }
              if (event.type === "done") {
                influence = event.influence;
              }
            }

            if (!influence) {
              throw new Error("Agent did not complete the turn");
            }

            const answerability = await classifyAnswerability(
              question.questionText,
              answer,
              influence,
              signal,
            );

            return { answer, influence, answerability };
          });

          const finishedAt = new Date();
          const saved = await BatchTestQuestionModel.updateOne(
            {
              _id: questionId,
              groupId,
              apiKeyId,
              status: "running",
              "execution.runId": runId,
            },
            {
              $set: {
                status: "completed",
                answer: outcome.answer,
                answerability: outcome.answerability,
                error: null,
                references: {
                  topics: outcome.influence.topics,
                  articles: outcome.influence.articles,
                  chunks: outcome.influence.chunks,
                },
                toolsDeclared: outcome.influence.declaredTools,
                toolsCalled: outcome.influence.tools,
                guidanceDeclared,
                guidanceUsed: outcome.influence.guidances,
                execution: {
                  runId,
                  startedAt,
                  finishedAt,
                },
                rating: null,
              },
            },
          );
          if (saved.modifiedCount > 0) completed += 1;
        } catch (error) {
          const timedOut =
            error instanceof Error &&
            (error.name === "TimeoutError" ||
              error.message === QUESTION_TIMEOUT_MESSAGE);
          const message = timedOut
            ? QUESTION_TIMEOUT_MESSAGE
            : error instanceof Error
              ? error.message
              : "Question execution failed";
          logger.error(message, logSource, "processRun");
          const saved = await BatchTestQuestionModel.updateOne(
            {
              _id: questionId,
              groupId,
              apiKeyId,
              status: "running",
              "execution.runId": runId,
            },
            {
              $set: {
                status: "failed",
                answer: null,
                answerability: null,
                error: message,
                references: emptyReferences(),
                toolsDeclared: [],
                toolsCalled: [],
                guidanceDeclared: [],
                guidanceUsed: [],
                execution: {
                  runId,
                  startedAt,
                  finishedAt: new Date(),
                },
                rating: null,
              },
            },
          );
          if (saved.modifiedCount > 0) failed += 1;
        }

        await this.bumpProgress(groupId, runId, completed, failed);
      }

      await BatchTestGroupModel.updateOne(
        { _id: groupId, latestRunId: runId },
        {
          $set: {
            runStatus: "completed",
            lastRunAt: new Date(),
            progress: {
              total: questionIds.length,
              completed,
              failed,
            },
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Batch test run failed";
      logger.error(message, logSource, "processRun");
      await BatchTestGroupModel.updateOne(
        { _id: groupId, latestRunId: runId },
        {
          $set: {
            runStatus: "failed",
            lastRunAt: new Date(),
          },
        },
      );
    } finally {
      await releaseSyncLock(lockKey).catch(() => undefined);
    }
  }

  private async bumpProgress(
    groupId: Types.ObjectId,
    runId: string,
    completed: number,
    failed: number,
  ): Promise<void> {
    await BatchTestGroupModel.updateOne(
      { _id: groupId, latestRunId: runId },
      {
        $set: {
          "progress.completed": completed,
          "progress.failed": failed,
        },
      },
    );
  }

  private async findOwnedGroup(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: string,
  ): Promise<GroupDoc> {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new Error("Batch test group not found");
    }
    const group = await BatchTestGroupModel.findOne({
      _id: new Types.ObjectId(groupId),
      apiKeyId,
    }).lean<GroupDoc>();
    if (!group) {
      throw new Error("Batch test group not found");
    }
    return group;
  }

  private async findOwnedQuestion(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: Types.ObjectId,
    questionId: string,
  ): Promise<QuestionDoc> {
    if (!Types.ObjectId.isValid(questionId)) {
      throw new Error("Batch test question not found");
    }
    const question = await BatchTestQuestionModel.findOne({
      _id: new Types.ObjectId(questionId),
      groupId,
      apiKeyId,
    }).lean<QuestionDoc>();
    if (!question) {
      throw new Error("Batch test question not found");
    }
    return question;
  }

  private async resolveOwnedQuestionIds(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: Types.ObjectId,
    questionIds: string[],
  ): Promise<Types.ObjectId[]> {
    const unique = [...new Set(questionIds)];
    const objectIds = unique.map((id) => new Types.ObjectId(id));
    const found = await BatchTestQuestionModel.find({
      _id: { $in: objectIds },
      groupId,
      apiKeyId,
    })
      .select("_id")
      .lean<Array<{ _id: Types.ObjectId }>>();

    if (found.length !== unique.length) {
      throw new Error("Batch test question not found");
    }

    const foundSet = new Set(found.map((doc) => doc._id.toString()));
    return objectIds.filter((id) => foundSet.has(id.toString()));
  }
}

export const batchTestService = new BatchTestService();

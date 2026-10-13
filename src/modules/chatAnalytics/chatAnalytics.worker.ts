import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import type { ChatAnalyticsJobInterface } from "../../models/chatAnalyticsJob/chatAnalyticsJob.interface";
import { ChatAnalyticsJobModel } from "../../models/chatAnalyticsJob/chatAnalyticsJob.model";
import { chatAnalyticsService } from "./chatAnalytics.service";

const logSource = "modules/chatAnalytics/chatAnalytics.worker.ts";

const MAX_CONCURRENCY = 2;
const STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5000;

type AnalyticsJobDoc = ChatAnalyticsJobInterface & { _id: Types.ObjectId };

let started = false;
let active = 0;
let tickInFlight = false;
let kickRequested = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let wakeAtMs = 0;

function backoffMs(attempts: number): number {
  const exp = Math.min(6, Math.max(0, attempts - 1));
  return BASE_BACKOFF_MS * 2 ** exp;
}

function scheduleKick(at: Date): void {
  const atMs = at.getTime();
  const delay = Math.max(0, atMs - Date.now());
  if (wakeTimer !== null && wakeAtMs <= atMs) {
    return;
  }
  if (wakeTimer !== null) {
    clearTimeout(wakeTimer);
  }
  wakeAtMs = atMs;
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    wakeAtMs = 0;
    kickChatAnalyticsWorker();
  }, delay);
  if (typeof wakeTimer.unref === "function") {
    wakeTimer.unref();
  }
}

async function requeueRunningOnBoot(): Promise<void> {
  const result = await ChatAnalyticsJobModel.updateMany(
    { jobStatus: "running" },
    {
      $set: {
        jobStatus: "pending",
        jobClaimedAt: null,
        jobNextAt: new Date(),
        jobLastError: "Interrupted by server restart",
      },
    },
  );
  if (result.modifiedCount > 0) {
    logger.info(
      `Requeued ${result.modifiedCount} chat analytics job(s) after restart`,
      logSource,
      "requeueRunningOnBoot",
    );
  }
}

async function reclaimStaleRunning(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  await ChatAnalyticsJobModel.updateMany(
    {
      jobStatus: "running",
      jobClaimedAt: { $lte: staleBefore },
    },
    {
      $set: {
        jobStatus: "pending",
        jobClaimedAt: null,
        jobNextAt: now,
        jobLastError: "Claim timed out; requeued",
      },
    },
  );
}

async function claimNext(now: Date): Promise<AnalyticsJobDoc | null> {
  return ChatAnalyticsJobModel.findOneAndUpdate(
    {
      jobStatus: "pending",
      $or: [{ jobNextAt: null }, { jobNextAt: { $lte: now } }],
    },
    {
      $set: {
        jobStatus: "running",
        jobClaimedAt: now,
      },
      $inc: { jobAttempts: 1 },
    },
    { sort: { jobNextAt: 1, createdAt: 1 }, new: true },
  ).lean<AnalyticsJobDoc | null>();
}

async function markDone(jobId: Types.ObjectId): Promise<void> {
  await ChatAnalyticsJobModel.updateOne(
    { _id: jobId },
    {
      $set: {
        jobStatus: "done",
        jobClaimedAt: null,
        jobNextAt: null,
        jobLastError: "",
      },
    },
  );
}

async function markFailure(
  job: AnalyticsJobDoc,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Chat analytics job failed";
  const attempts = job.jobAttempts;
  if (attempts < MAX_ATTEMPTS) {
    const nextAt = new Date(Date.now() + backoffMs(attempts));
    await ChatAnalyticsJobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          jobStatus: "pending",
          jobClaimedAt: null,
          jobNextAt: nextAt,
          jobLastError: message.slice(0, 500),
        },
      },
    );
    scheduleKick(nextAt);
    return;
  }

  await ChatAnalyticsJobModel.updateOne(
    { _id: job._id },
    {
      $set: {
        jobStatus: "failed",
        jobClaimedAt: null,
        jobNextAt: null,
        jobLastError: message.slice(0, 500),
      },
    },
  );
  logger.error(
    `Chat analytics failed permanently for ${job.chatMessageId.toString()}: ${message}`,
    logSource,
    "markFailure",
  );
}

async function processJob(job: AnalyticsJobDoc): Promise<void> {
  try {
    await chatAnalyticsService.analyzeCompletedTurn({
      executionMode: job.executionMode,
      userId: job.userId,
      apiKeyId: job.apiKeyId,
      chatSessionId: job.chatSessionId,
      userMessageId: job.chatMessageId,
      ...(job.assistantMessageId
        ? { assistantMessageId: job.assistantMessageId }
        : {}),
      ...(job.tools && job.tools.length > 0 ? { tools: job.tools } : {}),
    });
    await markDone(job._id);
  } catch (error) {
    await markFailure(job, error);
  }
}

async function tick(): Promise<void> {
  if (tickInFlight) {
    kickRequested = true;
    return;
  }
  tickInFlight = true;
  kickRequested = false;
  try {
    const now = new Date();
    await reclaimStaleRunning(now);

    while (active < MAX_CONCURRENCY) {
      const job = await claimNext(now);
      if (!job) break;
      active += 1;
      void processJob(job).finally(() => {
        active -= 1;
        kickChatAnalyticsWorker();
      });
    }
  } catch (error) {
    logger.error(
      error instanceof Error
        ? error.message
        : "Chat analytics worker tick failed",
      logSource,
      "tick",
    );
  } finally {
    tickInFlight = false;
    if (kickRequested) {
      kickRequested = false;
      kickChatAnalyticsWorker();
    }
  }
}

export function kickChatAnalyticsWorker(): void {
  void tick();
}

export async function startChatAnalyticsWorker(): Promise<void> {
  if (started) return;
  started = true;
  await requeueRunningOnBoot();
  kickChatAnalyticsWorker();
  logger.info(
    `Chat analytics worker started (concurrency=${MAX_CONCURRENCY})`,
    logSource,
    "startChatAnalyticsWorker",
  );
}

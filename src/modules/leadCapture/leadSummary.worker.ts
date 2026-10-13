import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import {
  type LeadInterface,
  type LeadStatus,
} from "../../models/leadCapture/leadCapture.interface";
import { LeadModel } from "../../models/leadCapture/lead.model";
import { leadCaptureService } from "./leadCapture.service";

const logSource = "modules/leadCapture/leadSummary.worker.ts";

const MAX_CONCURRENCY = 2;
const STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5000;

const SUBMITTED_STATUSES: LeadStatus[] = ["lead", "qualified", "hot"];

type LeadJobDoc = LeadInterface & { _id: Types.ObjectId };

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
    kickLeadSummaryWorker();
  }, delay);
  if (typeof wakeTimer.unref === "function") {
    wakeTimer.unref();
  }
}

async function requeueRunningOnBoot(): Promise<void> {
  const result = await LeadModel.updateMany(
    { summaryJobStatus: "running" },
    {
      $set: {
        summaryJobStatus: "pending",
        summaryJobClaimedAt: null,
        summaryJobNextAt: new Date(),
        summaryJobLastError: "Interrupted by server restart",
      },
    },
  );
  if (result.modifiedCount > 0) {
    logger.info(
      `Requeued ${result.modifiedCount} lead summary job(s) after restart`,
      logSource,
      "requeueRunningOnBoot",
    );
  }
}

/** Submitted leads with empty summary that are not already running/done. */
async function backfillPendingSummaries(): Promise<void> {
  const result = await LeadModel.updateMany(
    {
      status: { $in: SUBMITTED_STATUSES },
      $or: [{ summary: "" }, { summary: { $exists: false } }],
      summaryJobStatus: { $nin: ["running", "done"] },
    },
    {
      $set: {
        summaryJobStatus: "pending",
        summaryJobNextAt: new Date(),
        summaryJobLastError: "",
      },
    },
  );
  if (result.modifiedCount > 0) {
    logger.info(
      `Backfilled ${result.modifiedCount} lead summary job(s)`,
      logSource,
      "backfillPendingSummaries",
    );
  }
}

async function reclaimStaleRunning(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  await LeadModel.updateMany(
    {
      summaryJobStatus: "running",
      summaryJobClaimedAt: { $lte: staleBefore },
    },
    {
      $set: {
        summaryJobStatus: "pending",
        summaryJobClaimedAt: null,
        summaryJobNextAt: now,
        summaryJobLastError: "Claim timed out; requeued",
      },
    },
  );
}

async function claimNext(now: Date): Promise<LeadJobDoc | null> {
  return LeadModel.findOneAndUpdate(
    {
      summaryJobStatus: "pending",
      $or: [
        { summaryJobNextAt: null },
        { summaryJobNextAt: { $lte: now } },
      ],
    },
    {
      $set: {
        summaryJobStatus: "running",
        summaryJobClaimedAt: now,
      },
      $inc: { summaryJobAttempts: 1 },
    },
    { sort: { summaryJobNextAt: 1, createdAt: 1 }, new: true },
  ).lean<LeadJobDoc | null>();
}

async function markDone(leadId: Types.ObjectId, summary: string): Promise<void> {
  await LeadModel.updateOne(
    { _id: leadId },
    {
      $set: {
        summary,
        summaryJobStatus: "done",
        summaryJobClaimedAt: null,
        summaryJobNextAt: null,
        summaryJobLastError: "",
      },
    },
  );
}

async function markFailure(lead: LeadJobDoc, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Lead summary failed";
  const attempts = lead.summaryJobAttempts;
  if (attempts < MAX_ATTEMPTS) {
    const nextAt = new Date(Date.now() + backoffMs(attempts));
    await LeadModel.updateOne(
      { _id: lead._id },
      {
        $set: {
          summaryJobStatus: "pending",
          summaryJobClaimedAt: null,
          summaryJobNextAt: nextAt,
          summaryJobLastError: message.slice(0, 500),
        },
      },
    );
    scheduleKick(nextAt);
    return;
  }

  await LeadModel.updateOne(
    { _id: lead._id },
    {
      $set: {
        summaryJobStatus: "failed",
        summaryJobClaimedAt: null,
        summaryJobNextAt: null,
        summaryJobLastError: message.slice(0, 500),
      },
    },
  );
  logger.error(
    `Lead summary failed permanently for ${lead._id.toString()}: ${message}`,
    logSource,
    "markFailure",
  );
}

async function processLead(lead: LeadJobDoc): Promise<void> {
  try {
    const summary = await leadCaptureService.generateLeadSummaryText(lead._id);
    await markDone(lead._id, summary);
  } catch (error) {
    await markFailure(lead, error);
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
      const lead = await claimNext(now);
      if (!lead) break;
      active += 1;
      void processLead(lead).finally(() => {
        active -= 1;
        kickLeadSummaryWorker();
      });
    }
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : "Lead summary worker tick failed",
      logSource,
      "tick",
    );
  } finally {
    tickInFlight = false;
    if (kickRequested) {
      kickRequested = false;
      kickLeadSummaryWorker();
    }
  }
}

export function kickLeadSummaryWorker(): void {
  void tick();
}

export async function startLeadSummaryWorker(): Promise<void> {
  if (started) return;
  started = true;
  await requeueRunningOnBoot();
  await backfillPendingSummaries();
  kickLeadSummaryWorker();
  logger.info(
    `Lead summary worker started (concurrency=${MAX_CONCURRENCY})`,
    logSource,
    "startLeadSummaryWorker",
  );
}

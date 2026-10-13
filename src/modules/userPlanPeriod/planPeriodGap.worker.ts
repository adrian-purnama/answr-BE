import { Types } from "mongoose";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { PlanModel } from "../../models/plan/plan.model";
import { UserModel } from "../../models/user/user.model";
import { syncApiKeysToPlanLimit } from "../user/syncApiKeysToPlanLimit";
import { userPlanPeriodService } from "./userPlanPeriod.service";

const logSource = "modules/userPlanPeriod/planPeriodGap.worker.ts";

export type PlanPeriodSyncStatus = {
  nextRunAt: string | null;
  lastRunAt: string | null;
  msUntilNext: number | null;
  intervalMs: number;
  running: boolean;
};

export type PlanPeriodSyncResult = PlanPeriodSyncStatus & {
  usersProcessed: number;
  keysResynced: number;
  skipped: boolean;
};

let started = false;
let running = false;
let nextRunAt: Date | null = null;
let lastRunAt: Date | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const BATCH = 50;

function statusSnapshot(): PlanPeriodSyncStatus {
  return {
    nextRunAt: nextRunAt?.toISOString() ?? null,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    msUntilNext: nextRunAt
      ? Math.max(0, nextRunAt.getTime() - Date.now())
      : null,
    intervalMs: env.planPeriodGapIntervalMs,
    running,
  };
}

async function resyncMismatchedKeys(): Promise<number> {
  let resynced = 0;
  const users = await UserModel.find({
    planId: { $ne: null },
  })
    .select("_id planId")
    .limit(200)
    .lean<Array<{ _id: Types.ObjectId; planId?: Types.ObjectId }>>();

  for (const user of users) {
    if (!user.planId) continue;
    try {
      const plan = await PlanModel.findById(user.planId)
        .select("maxApiKeys")
        .lean<{ maxApiKeys: number } | null>();
      if (!plan) continue;

      const keys = await ApiKeyModel.find({
        userId: user._id,
        "status.status": { $ne: "revoked" },
      })
        .sort({ _id: 1 })
        .select("status.status")
        .lean<Array<{ status: { status: string } }>>();

      const limit = plan.maxApiKeys;
      let mismatch = false;
      for (let i = 0; i < keys.length; i++) {
        const status = keys[i]!.status.status;
        if (i < limit && status === "disabled_plan") {
          mismatch = true;
          break;
        }
        if (i >= limit && status === "active") {
          mismatch = true;
          break;
        }
      }
      if (!mismatch) continue;

      await syncApiKeysToPlanLimit(user._id, limit);
      resynced += 1;
    } catch (err) {
      logger.error(
        `Key resync failed for ${user._id.toString()}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        logSource,
        "resyncMismatchedKeys",
      );
    }
  }
  return resynced;
}

async function processTick(): Promise<PlanPeriodSyncResult> {
  if (running) {
    return { ...statusSnapshot(), usersProcessed: 0, keysResynced: 0, skipped: true };
  }
  running = true;
  let usersProcessed = 0;
  let keysResynced = 0;

  try {
    const now = new Date();
    let skip = 0;
    for (;;) {
      const batch = await UserModel.find({
        planPeriodUntil: { $lte: now },
      })
        .select("_id")
        .sort({ _id: 1 })
        .skip(skip)
        .limit(BATCH)
        .lean<Array<{ _id: Types.ObjectId }>>();

      if (batch.length === 0) break;

      for (const row of batch) {
        try {
          await userPlanPeriodService.fillGapsForUser(row._id);
          usersProcessed += 1;
        } catch (err) {
          logger.error(
            `fillGaps failed for ${row._id.toString()}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            logSource,
            "processTick",
          );
        }
      }

      if (batch.length < BATCH) break;
      skip += BATCH;
    }

    keysResynced = await resyncMismatchedKeys();
    lastRunAt = new Date();
    logger.info(
      `Plan period sync: users=${usersProcessed}, keysResynced=${keysResynced}`,
      logSource,
      "processTick",
    );
    return { ...statusSnapshot(), usersProcessed, keysResynced, skipped: false };
  } catch (err) {
    logger.error(
      err instanceof Error ? err.message : String(err),
      logSource,
      "processTick",
    );
    throw err;
  } finally {
    running = false;
  }
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer);
  const interval = env.planPeriodGapIntervalMs;
  nextRunAt = new Date(Date.now() + interval);
  timer = setTimeout(() => {
    void processTick()
      .catch(() => undefined)
      .finally(() => {
        scheduleNext();
      });
  }, interval);
}

export function getPlanPeriodSyncStatus(): PlanPeriodSyncStatus {
  return statusSnapshot();
}

export async function runPlanPeriodSyncNow(): Promise<PlanPeriodSyncResult> {
  return processTick();
}

export async function startPlanPeriodGapWorker(): Promise<void> {
  if (started) return;
  started = true;
  await processTick().catch(() => undefined);
  scheduleNext();
  logger.info(
    `Plan period gap worker started (interval=${env.planPeriodGapIntervalMs}ms)`,
    logSource,
    "startPlanPeriodGapWorker",
  );
}

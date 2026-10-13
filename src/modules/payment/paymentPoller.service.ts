import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import { InvoiceModel } from "../../models/invoice/invoice.model";
import { invoiceService } from "./invoice.service";
import { paymentPollConfig } from "./payment.config";

const logSource = "modules/payment/paymentPoller.service.ts";
const CONCURRENCY = 3;

let started = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

type PendingLean = {
  _id: Types.ObjectId;
  expiresAt: Date;
  lastPolledAt?: Date | null;
};

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index;
        index += 1;
        const item = items[i];
        if (!item) continue;
        try {
          await fn(item);
        } catch (err) {
          logger.error(
            `Poll item failed: ${err instanceof Error ? err.message : String(err)}`,
            logSource,
            "mapPool",
          );
        }
      }
    },
  );
  await Promise.all(workers);
}

async function pollOne(row: PendingLean): Promise<void> {
  logger.debug(
    `Background poll orderId=${row._id.toString()}`,
    logSource,
    "pollOne",
  );
  await invoiceService.pollInvoiceFromMidtrans(
    row._id,
    paymentPollConfig.intervalMs,
  );
}

async function processCycle(): Promise<void> {
  if (running || shuttingDown) return;
  running = true;
  try {
    const now = new Date();
    const cfg = paymentPollConfig;
    const minCreatedAt = new Date(now.getTime() - cfg.minAgeMs);
    const pollThreshold = new Date(now.getTime() - cfg.intervalMs);
    const graceFloor = new Date(now.getTime() - cfg.expiryGraceMs);

    const candidates = await InvoiceModel.find({
      status: "pending",
      expiresAt: { $gt: graceFloor },
      createdAt: { $lte: minCreatedAt },
      $or: [
        { lastPolledAt: null },
        { lastPolledAt: { $exists: false } },
        { lastPolledAt: { $lte: pollThreshold } },
      ],
    })
      .sort({ lastPolledAt: 1 })
      .limit(cfg.batchSize)
      .select("_id expiresAt lastPolledAt")
      .lean<PendingLean[]>();

    if (candidates.length === 0) return;

    await mapPool(candidates, CONCURRENCY, pollOne);
  } catch (err) {
    logger.error(
      err instanceof Error ? err.message : String(err),
      logSource,
      "processCycle",
    );
  } finally {
    running = false;
  }
}

function scheduleNext(): void {
  if (shuttingDown) return;
  if (timer) clearTimeout(timer);
  const interval = paymentPollConfig.intervalMs;
  timer = setTimeout(() => {
    void processCycle().finally(() => {
      scheduleNext();
    });
  }, interval);
}

function onSignal(): void {
  stopPaymentPoller();
}

export function stopPaymentPoller(): void {
  shuttingDown = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  logger.info("Payment poller stopped", logSource, "stopPaymentPoller");
}

export async function startPaymentPoller(): Promise<void> {
  if (started) return;
  started = true;
  shuttingDown = false;

  const cfg = paymentPollConfig;
  logger.info(
    `Payment poller config: intervalMs=${cfg.intervalMs} minAgeMs=${cfg.minAgeMs} onDemandThrottleMs=${cfg.onDemandThrottleMs} batchSize=${cfg.batchSize} expiryGraceMs=${cfg.expiryGraceMs}`,
    logSource,
    "startPaymentPoller",
  );

  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  await processCycle();
  scheduleNext();
  logger.info(
    `Payment poller started (interval=${cfg.intervalMs}ms)`,
    logSource,
    "startPaymentPoller",
  );
}

/** Test seam: run one cycle immediately. */
export async function runPaymentPollCycleNow(): Promise<void> {
  await processCycle();
}

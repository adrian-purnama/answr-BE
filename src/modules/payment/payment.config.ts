import { env } from "../../environment/env";

export type PaymentPollConfig = {
  intervalMs: number;
  minAgeMs: number;
  onDemandThrottleMs: number;
  batchSize: number;
  expiryGraceMs: number;
};

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

/** minAge may be 0 (poll immediately in development). */
function parseNonNegativeInt(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

function defaultsForBuild(build: "development" | "production"): PaymentPollConfig {
  if (build === "production") {
    return {
      intervalMs: 60_000,
      minAgeMs: 120_000,
      onDemandThrottleMs: 20_000,
      batchSize: 50,
      expiryGraceMs: 900_000,
    };
  }
  return {
    intervalMs: 5_000,
    minAgeMs: 0,
    onDemandThrottleMs: 2_000,
    batchSize: 20,
    expiryGraceMs: 300_000,
  };
}

export function loadPaymentPollConfig(
  build: "development" | "production" = env.build,
): PaymentPollConfig {
  const base = defaultsForBuild(build);
  return {
    intervalMs: parsePositiveInt(
      "PAYMENT_POLL_INTERVAL_MS",
      process.env.PAYMENT_POLL_INTERVAL_MS,
      base.intervalMs,
    ),
    minAgeMs: parseNonNegativeInt(
      "PAYMENT_POLL_MIN_AGE_MS",
      process.env.PAYMENT_POLL_MIN_AGE_MS,
      base.minAgeMs,
    ),
    onDemandThrottleMs: parsePositiveInt(
      "PAYMENT_POLL_ONDEMAND_THROTTLE_MS",
      process.env.PAYMENT_POLL_ONDEMAND_THROTTLE_MS,
      base.onDemandThrottleMs,
    ),
    batchSize: parsePositiveInt(
      "PAYMENT_POLL_BATCH_SIZE",
      process.env.PAYMENT_POLL_BATCH_SIZE,
      base.batchSize,
    ),
    expiryGraceMs: parsePositiveInt(
      "PAYMENT_POLL_EXPIRY_GRACE_MS",
      process.env.PAYMENT_POLL_EXPIRY_GRACE_MS,
      base.expiryGraceMs,
    ),
  };
}

export const paymentPollConfig = loadPaymentPollConfig();

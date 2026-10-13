import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPaymentPollConfig } from "./payment.config";

test("development and production defaults differ as specified", () => {
  const keys = [
    "PAYMENT_POLL_INTERVAL_MS",
    "PAYMENT_POLL_MIN_AGE_MS",
    "PAYMENT_POLL_ONDEMAND_THROTTLE_MS",
    "PAYMENT_POLL_BATCH_SIZE",
    "PAYMENT_POLL_EXPIRY_GRACE_MS",
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const dev = loadPaymentPollConfig("development");
    assert.equal(dev.intervalMs, 5_000);
    assert.equal(dev.minAgeMs, 0);
    assert.equal(dev.onDemandThrottleMs, 2_000);
    assert.equal(dev.batchSize, 20);
    assert.equal(dev.expiryGraceMs, 300_000);

    const prod = loadPaymentPollConfig("production");
    assert.equal(prod.intervalMs, 60_000);
    assert.equal(prod.minAgeMs, 120_000);
    assert.equal(prod.onDemandThrottleMs, 20_000);
    assert.equal(prod.batchSize, 50);
    assert.equal(prod.expiryGraceMs, 900_000);

    assert.ok(prod.intervalMs > dev.intervalMs);
    assert.ok(prod.minAgeMs > dev.minAgeMs);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("invalid override values fail at load", () => {
  const prev = process.env.PAYMENT_POLL_INTERVAL_MS;
  try {
    process.env.PAYMENT_POLL_INTERVAL_MS = "-1";
    assert.throws(
      () => loadPaymentPollConfig("development"),
      /PAYMENT_POLL_INTERVAL_MS/,
    );
    process.env.PAYMENT_POLL_INTERVAL_MS = "abc";
    assert.throws(
      () => loadPaymentPollConfig("development"),
      /PAYMENT_POLL_INTERVAL_MS/,
    );
  } finally {
    if (prev === undefined) delete process.env.PAYMENT_POLL_INTERVAL_MS;
    else process.env.PAYMENT_POLL_INTERVAL_MS = prev;
  }
});

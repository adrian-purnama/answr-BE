import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { backdateFloor } from "../../utils/calendarMonth";
import { PLAN_NEVER_UNTIL } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { findOverlappingPeriod, periodsOverlap } from "./planPeriod.overlap";
import { buildPreview, normalizeInputs } from "./userPlanPeriod.service";

process.env.MONGODB_URL ??= "mongodb://localhost/test";
process.env.FRONTEND_URL ??= "https://app.example.com";
process.env.SMTP_HOST ??= "smtp.example.com";
process.env.SMTP_PORT ??= "465";
process.env.SMTP_SECURE ??= "true";
process.env.SMTP_USER ??= "test@example.com";
process.env.SMTP_PASSWORD ??= "test";
process.env.MAIL_FROM ??= "test@example.com";
process.env.JWT_SECRET ??= "test-secret";
process.env.BUILD ??= "development";
process.env.MIDTRANS_SERVER_KEY ??= "SB-Mid-server-test";
process.env.MIDTRANS_CLIENT_KEY ??= "SB-Mid-client-test";

const d = (iso: string) => new Date(iso);

function period(opts: {
  id?: Types.ObjectId;
  planId?: Types.ObjectId;
  effectiveDate: Date;
  untilDate: Date;
  adjustments?: number;
}) {
  return {
    _id: opts.id ?? new Types.ObjectId(),
    userId: new Types.ObjectId(),
    planId: opts.planId ?? new Types.ObjectId(),
    effectiveDate: opts.effectiveDate,
    untilDate: opts.untilDate,
    source: "manual" as const,
    deepseekQuotaPerPeriod: 1000,
    deepseekTokenAdjustments:
      opts.adjustments && opts.adjustments > 0
        ? Array.from({ length: opts.adjustments }, () => ({
            requestedAmount: 100,
            appliedAmount: 100,
            reason: "test",
            source: "invoice" as const,
            createdAt: new Date(),
          }))
        : [],
  };
}

test("backdating floor rejects inserts into elapsed active slice conceptually", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const floor = backdateFloor(now);
  const activeStart = d("2026-06-01T00:00:00.000Z");
  const attempted = d("2026-06-10T00:00:00.000Z");
  assert.ok(attempted.getTime() > activeStart.getTime());
  assert.ok(attempted.getTime() < floor.getTime());
});

test("adjacent A then B has no overlap at boundary T", () => {
  const T = d("2026-07-01T00:00:00.000Z");
  const a = { effectiveDate: d("2026-06-01T00:00:00.000Z"), untilDate: T };
  const b = { effectiveDate: T, untilDate: d("2026-08-01T00:00:00.000Z") };
  assert.equal(periodsOverlap(a, b), false);
  assert.equal(findOverlappingPeriod(b, [a]), null);
});

test("isNeverUntil sentinel", async () => {
  const { isNeverUntil, PLAN_NEVER_UNTIL: never } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.interface.js"
  );
  assert.equal(isNeverUntil(never), true);
  assert.equal(isNeverUntil(d("2026-01-01T00:00:00.000Z")), false);
});

test("isDuplicateKeyError detects E11000", async () => {
  const { isDuplicateKeyError } = await import("./planPeriodConflict.error.js");
  assert.equal(isDuplicateKeyError({ code: 11000 }), true);
  assert.equal(isDuplicateKeyError(new Error("E11000 duplicate key")), true);
  assert.equal(isDuplicateKeyError(new Error("other")), false);
  assert.equal(isDuplicateKeyError(null), false);
});

test("normalizeInputs effectiveMode=now uses server now not client ISO", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const planId = new Types.ObjectId().toString();
  const [n] = normalizeInputs(
    [
      {
        planId,
        untilDate: PLAN_NEVER_UNTIL.toISOString(),
        effectiveMode: "now",
        effectiveDate: "2099-01-01T00:00:00.000Z",
      },
    ],
    now,
  );
  assert.equal(n!.effectiveDate.getTime(), now.getTime());
  assert.equal(n!.effectiveMode, "now");
});

test("A1-like: now into forever active truncates and becomes current window", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const planOld = new Types.ObjectId();
  const planNew = new Types.ObjectId();
  const existing = [
    period({
      planId: planOld,
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: PLAN_NEVER_UNTIL,
      adjustments: 1,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: planNew.toString(),
        untilDate: PLAN_NEVER_UNTIL.toISOString(),
        effectiveMode: "now",
      },
    ],
    now,
  );
  const preview = buildPreview(existing, normalized, now, false);
  assert.equal(preview.wouldTruncate, true);
  assert.equal(preview.truncateTo?.getTime(), now.getTime());
  assert.equal(preview.remainder, null);
  assert.equal(preview.truncatedPeriodHadTokenAdjustments, true);
  assert.equal(preview.normalized[0]!.effectiveDate.getTime(), now.getTime());
});

test("A5 absolute future: new upcoming, no truncate of active before start", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const future = d("2026-06-15T12:00:30.000Z");
  const planOld = new Types.ObjectId();
  const planNew = new Types.ObjectId();
  const existing = [
    period({
      planId: planOld,
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: PLAN_NEVER_UNTIL,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: planNew.toString(),
        effectiveDate: future.toISOString(),
        untilDate: PLAN_NEVER_UNTIL.toISOString(),
        effectiveMode: "absolute",
      },
    ],
    now,
  );
  const preview = buildPreview(existing, normalized, now, false);
  assert.equal(preview.wouldTruncate, true);
  assert.equal(preview.truncateTo?.getTime(), future.getTime());
  // At `now`, active still contains now until truncate is applied at future.
  assert.ok(future.getTime() > now.getTime());
});

test("A6 equal-start replace truncates with >=", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const start = d("2026-06-15T11:59:58.000Z"); // within 5s floor
  const planOld = new Types.ObjectId();
  const planNew = new Types.ObjectId();
  const existing = [
    period({
      planId: planOld,
      effectiveDate: start,
      untilDate: PLAN_NEVER_UNTIL,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: planNew.toString(),
        effectiveDate: start.toISOString(),
        untilDate: PLAN_NEVER_UNTIL.toISOString(),
        effectiveMode: "absolute",
      },
    ],
    now,
  );
  const preview = buildPreview(existing, normalized, now, false);
  assert.equal(preview.wouldTruncate, true);
  assert.equal(preview.truncateTo?.getTime(), start.getTime());
});

test("A7 absolute before floor rejects", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const planId = new Types.ObjectId().toString();
  const normalized = normalizeInputs(
    [
      {
        planId,
        effectiveDate: d("2026-06-15T11:00:00.000Z").toISOString(),
        untilDate: PLAN_NEVER_UNTIL.toISOString(),
        effectiveMode: "absolute",
      },
    ],
    now,
  );
  assert.throws(
    () => buildPreview([], normalized, now, false),
    /earlier than now/,
  );
});

test("A9 cannot continue after never-ending latest", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const existing = [
    period({
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: PLAN_NEVER_UNTIL,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: new Types.ObjectId().toString(),
        effectiveDate: PLAN_NEVER_UNTIL.toISOString(),
        untilDate: d("9999-02-01T00:00:00.000Z").toISOString(),
        effectiveMode: "absolute",
      },
    ],
    now,
  );
  assert.throws(
    () => buildPreview(existing, normalized, now, false),
    /never-ending period/,
  );
});

test("A12 within-batch overlap rejects", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const planA = new Types.ObjectId().toString();
  const planB = new Types.ObjectId().toString();
  const start = d("2026-06-15T12:00:00.000Z");
  const mid = d("2026-07-01T00:00:00.000Z");
  const end = d("2026-08-01T00:00:00.000Z");
  const normalized = normalizeInputs(
    [
      {
        planId: planA,
        effectiveDate: start.toISOString(),
        untilDate: end.toISOString(),
      },
      {
        planId: planB,
        effectiveDate: mid.toISOString(),
        untilDate: end.toISOString(),
      },
    ],
    now,
  );
  assert.throws(
    () => buildPreview([], normalized, now, false),
    /batch overlap/,
  );
});

test("A3 preserveRemainder=false flags wouldCreateGaps", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const aUntil = d("2026-08-01T00:00:00.000Z");
  const newUntil = d("2026-07-01T00:00:00.000Z");
  const existing = [
    period({
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: aUntil,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: new Types.ObjectId().toString(),
        untilDate: newUntil.toISOString(),
        effectiveMode: "now",
      },
    ],
    now,
  );
  const preview = buildPreview(existing, normalized, now, false);
  assert.equal(preview.wouldTruncate, true);
  assert.ok(preview.remainder);
  assert.equal(preview.wouldCreateGaps.length, 1);
});

test("A4 preserveRemainder=true keeps remainder", () => {
  const now = d("2026-06-15T12:00:00.000Z");
  const aUntil = d("2026-08-01T00:00:00.000Z");
  const newUntil = d("2026-07-01T00:00:00.000Z");
  const existing = [
    period({
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: aUntil,
    }),
  ];
  const normalized = normalizeInputs(
    [
      {
        planId: new Types.ObjectId().toString(),
        untilDate: newUntil.toISOString(),
        effectiveMode: "now",
      },
    ],
    now,
  );
  const preview = buildPreview(existing, normalized, now, true);
  assert.ok(preview.remainder);
  assert.equal(preview.wouldCreateGaps.length, 0);
});

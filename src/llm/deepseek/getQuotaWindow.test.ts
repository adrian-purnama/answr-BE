import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_NEVER_UNTIL } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { countQuotaWindows, getQuotaWindow, MS_PER_DAY } from "./getQuotaWindow";

const d = (iso: string) => new Date(iso);

describe("getQuotaWindow", () => {
  it("fixed-term with null window days uses the whole period", () => {
    const window = getQuotaWindow(
      {
        effectiveDate: d("2026-01-01T00:00:00.000Z"),
        untilDate: d("2026-02-01T00:00:00.000Z"),
      },
      { quotaWindowDays: null },
      d("2026-01-15T12:00:00.000Z"),
    );
    assert.ok(window);
    assert.equal(window.windowIndex, 0);
    assert.equal(window.windowStart.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(window.windowEnd.toISOString(), "2026-02-01T00:00:00.000Z");
  });

  it("fixed-term with N-day windows indexes from period start", () => {
    const period = {
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: d("2026-03-01T00:00:00.000Z"),
    };
    const first = getQuotaWindow(period, { quotaWindowDays: 30 }, d("2026-01-10T00:00:00.000Z"));
    assert.ok(first);
    assert.equal(first.windowIndex, 0);
    assert.equal(first.windowEnd.toISOString(), "2026-01-31T00:00:00.000Z");

    const second = getQuotaWindow(
      period,
      { quotaWindowDays: 30 },
      d("2026-01-31T00:00:00.000Z"),
    );
    assert.ok(second);
    assert.equal(second.windowIndex, 1);
    assert.equal(second.windowStart.toISOString(), "2026-01-31T00:00:00.000Z");
  });

  it("clamps the last fixed-term window to period end", () => {
    const period = {
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: d("2026-01-20T00:00:00.000Z"),
    };
    const window = getQuotaWindow(
      period,
      { quotaWindowDays: 30 },
      d("2026-01-10T00:00:00.000Z"),
    );
    assert.ok(window);
    assert.equal(window.windowIndex, 0);
    assert.equal(window.windowEnd.toISOString(), "2026-01-20T00:00:00.000Z");
  });

  it("open-ended with null window days uses rolling 30-day windows", () => {
    const start = d("2026-01-01T00:00:00.000Z");
    const window = getQuotaWindow(
      { effectiveDate: start, untilDate: PLAN_NEVER_UNTIL },
      { quotaWindowDays: null },
      new Date(start.getTime() + 45 * MS_PER_DAY),
    );
    assert.ok(window);
    assert.equal(window.windowIndex, 1);
    assert.equal(window.windowStart.toISOString(), "2026-01-31T00:00:00.000Z");
    assert.equal(window.windowEnd.toISOString(), "2026-03-02T00:00:00.000Z");
  });

  it("returns null when now is outside the period", () => {
    const period = {
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: d("2026-02-01T00:00:00.000Z"),
    };
    assert.equal(
      getQuotaWindow(period, { quotaWindowDays: null }, d("2025-12-31T23:59:59.999Z")),
      null,
    );
    assert.equal(
      getQuotaWindow(period, { quotaWindowDays: null }, d("2026-02-01T00:00:00.000Z")),
      null,
    );
  });

  it("treats now exactly on a window boundary as the next window", () => {
    const period = {
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: d("2026-04-01T00:00:00.000Z"),
    };
    const boundary = d("2026-01-31T00:00:00.000Z");
    const window = getQuotaWindow(period, { quotaWindowDays: 30 }, boundary);
    assert.ok(window);
    assert.equal(window.windowIndex, 1);
    assert.equal(window.windowStart.toISOString(), boundary.toISOString());
  });

  it("countQuotaWindows: null window days = 1; open-ended = null", () => {
    assert.equal(
      countQuotaWindows(
        {
          effectiveDate: d("2026-01-01T00:00:00.000Z"),
          untilDate: d("2026-02-01T00:00:00.000Z"),
        },
        { quotaWindowDays: null },
      ),
      1,
    );
    assert.equal(
      countQuotaWindows(
        {
          effectiveDate: d("2026-01-01T00:00:00.000Z"),
          untilDate: PLAN_NEVER_UNTIL,
        },
        { quotaWindowDays: 30 },
      ),
      null,
    );
    assert.equal(
      countQuotaWindows(
        {
          effectiveDate: d("2026-01-01T00:00:00.000Z"),
          untilDate: d("2026-04-01T00:00:00.000Z"),
        },
        { quotaWindowDays: 30 },
      ),
      3,
    );
  });
});

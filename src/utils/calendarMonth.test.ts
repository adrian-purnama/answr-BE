import assert from "node:assert/strict";
import { test } from "node:test";
import { addCalendarMonths, backdateFloor, PLAN_BACKDATE_SKEW_MS } from "./calendarMonth";

test("addCalendarMonths clamps Jan 31 to Feb 28 in non-leap year", () => {
  const jan31 = new Date(Date.UTC(2025, 0, 31, 12, 0, 0));
  const feb = addCalendarMonths(jan31, 1);
  assert.equal(feb.toISOString(), "2025-02-28T12:00:00.000Z");
});

test("addCalendarMonths clamps Jan 31 to Feb 29 in leap year", () => {
  const jan31 = new Date(Date.UTC(2024, 0, 31, 12, 0, 0));
  const feb = addCalendarMonths(jan31, 1);
  assert.equal(feb.toISOString(), "2024-02-29T12:00:00.000Z");
});

test("addCalendarMonths preserves day when target has enough days", () => {
  const mar15 = new Date(Date.UTC(2025, 2, 15, 8, 30, 0));
  const may = addCalendarMonths(mar15, 2);
  assert.equal(may.toISOString(), "2025-05-15T08:30:00.000Z");
});

test("backdateFloor is now minus skew", () => {
  const now = new Date("2026-06-01T00:00:05.000Z");
  const floor = backdateFloor(now);
  assert.equal(floor.getTime(), now.getTime() - PLAN_BACKDATE_SKEW_MS);
});

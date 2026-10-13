import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertValidRange,
  computeGaps,
  findOverlappingPeriod,
  periodsOverlap,
} from "./planPeriod.overlap";

const d = (iso: string) => new Date(iso);

test("exact adjacency does not overlap", () => {
  const a = { effectiveDate: d("2026-01-01T00:00:00.000Z"), untilDate: d("2026-02-01T00:00:00.000Z") };
  const b = { effectiveDate: d("2026-02-01T00:00:00.000Z"), untilDate: d("2026-03-01T00:00:00.000Z") };
  assert.equal(periodsOverlap(a, b), false);
  assert.equal(findOverlappingPeriod(b, [a]), null);
});

test("overlap too low / too high / inside / containing", () => {
  const existing = {
    effectiveDate: d("2026-02-01T00:00:00.000Z"),
    untilDate: d("2026-03-01T00:00:00.000Z"),
  };
  // too high: starts before, ends inside
  assert.equal(
    periodsOverlap(existing, {
      effectiveDate: d("2026-01-15T00:00:00.000Z"),
      untilDate: d("2026-02-15T00:00:00.000Z"),
    }),
    true,
  );
  // too low: starts inside, ends after
  assert.equal(
    periodsOverlap(existing, {
      effectiveDate: d("2026-02-15T00:00:00.000Z"),
      untilDate: d("2026-03-15T00:00:00.000Z"),
    }),
    true,
  );
  // fully inside
  assert.equal(
    periodsOverlap(existing, {
      effectiveDate: d("2026-02-10T00:00:00.000Z"),
      untilDate: d("2026-02-20T00:00:00.000Z"),
    }),
    true,
  );
  // fully containing
  assert.equal(
    periodsOverlap(existing, {
      effectiveDate: d("2026-01-01T00:00:00.000Z"),
      untilDate: d("2026-04-01T00:00:00.000Z"),
    }),
    true,
  );
});

test("assertValidRange rejects inverted dates", () => {
  assert.throws(() =>
    assertValidRange({
      effectiveDate: d("2026-03-01T00:00:00.000Z"),
      untilDate: d("2026-02-01T00:00:00.000Z"),
    }),
  );
});

test("computeGaps finds hole between periods", () => {
  const gaps = computeGaps([
    { effectiveDate: d("2026-01-01T00:00:00.000Z"), untilDate: d("2026-02-01T00:00:00.000Z") },
    { effectiveDate: d("2026-02-01T01:00:00.000Z"), untilDate: d("2026-03-01T00:00:00.000Z") },
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]!.effectiveDate.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(gaps[0]!.untilDate.toISOString(), "2026-02-01T01:00:00.000Z");
});

export type PeriodRange = {
  effectiveDate: Date;
  untilDate: Date;
};

/**
 * Half-open overlap: existing.effectiveDate < new.untilDate
 * AND existing.untilDate > new.effectiveDate.
 * Exact adjacency (a.untilDate === b.effectiveDate) does NOT overlap.
 */
export function periodsOverlap(a: PeriodRange, b: PeriodRange): boolean {
  return (
    a.effectiveDate.getTime() < b.untilDate.getTime() &&
    a.untilDate.getTime() > b.effectiveDate.getTime()
  );
}

export function findOverlappingPeriod<T extends PeriodRange>(
  candidate: PeriodRange,
  existing: T[],
): T | null {
  for (const period of existing) {
    if (periodsOverlap(candidate, period)) return period;
  }
  return null;
}

export function assertValidRange(range: PeriodRange): void {
  if (!(range.effectiveDate instanceof Date) || Number.isNaN(range.effectiveDate.getTime())) {
    throw new Error("effectiveDate must be a valid date");
  }
  if (!(range.untilDate instanceof Date) || Number.isNaN(range.untilDate.getTime())) {
    throw new Error("untilDate must be a valid date");
  }
  if (range.effectiveDate.getTime() >= range.untilDate.getTime()) {
    throw new Error("effectiveDate must be before untilDate");
  }
}

/** Compute gaps between sorted periods (and optionally from `from` if uncovered). */
export function computeGaps(
  periodsSorted: PeriodRange[],
  options?: { from?: Date; until?: Date },
): PeriodRange[] {
  const gaps: PeriodRange[] = [];
  if (periodsSorted.length === 0) {
    if (options?.from && options?.until && options.from < options.until) {
      gaps.push({ effectiveDate: options.from, untilDate: options.until });
    }
    return gaps;
  }

  for (let i = 0; i < periodsSorted.length - 1; i++) {
    const cur = periodsSorted[i]!;
    const next = periodsSorted[i + 1]!;
    if (cur.untilDate.getTime() < next.effectiveDate.getTime()) {
      gaps.push({
        effectiveDate: cur.untilDate,
        untilDate: next.effectiveDate,
      });
    }
  }
  return gaps;
}

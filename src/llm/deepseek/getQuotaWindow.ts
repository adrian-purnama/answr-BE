import { isNeverUntil } from "../../models/userPlanPeriod/userPlanPeriod.interface";

/** UTC day length in ms (no DST). */
export const MS_PER_DAY = 86_400_000;

export type QuotaPeriodBounds = {
  effectiveDate: Date;
  untilDate: Date;
};

export type QuotaPlanWindowConfig = {
  /** null/undefined = whole period for fixed-term; open-ended treats as 30. */
  quotaWindowDays?: number | null;
};

export type QuotaWindow = {
  windowStart: Date;
  windowEnd: Date;
  windowIndex: number;
};

function truncPositiveDays(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return null;
  return Math.trunc(raw);
}

/**
 * Pure UTC quota window for a plan period.
 * Half-open: now in [effectiveDate, untilDate); window boundaries are half-open too.
 */
export function getQuotaWindow(
  period: QuotaPeriodBounds,
  plan: QuotaPlanWindowConfig,
  now: Date,
): QuotaWindow | null {
  const startMs = period.effectiveDate.getTime();
  const untilMs = period.untilDate.getTime();
  const nowMs = now.getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(untilMs) ||
    !Number.isFinite(nowMs)
  ) {
    return null;
  }
  if (nowMs < startMs || nowMs >= untilMs) {
    return null;
  }

  const openEnded = isNeverUntil(period.untilDate);
  const configured = truncPositiveDays(plan.quotaWindowDays);

  if (!openEnded && configured == null) {
    return {
      windowStart: new Date(startMs),
      windowEnd: new Date(untilMs),
      windowIndex: 0,
    };
  }

  const days = configured ?? 30;
  const windowMs = days * MS_PER_DAY;
  const elapsed = nowMs - startMs;
  const windowIndex = Math.floor(elapsed / windowMs);
  const windowStartMs = startMs + windowIndex * windowMs;
  const uncappedEndMs = windowStartMs + windowMs;
  const windowEndMs = openEnded
    ? uncappedEndMs
    : Math.min(uncappedEndMs, untilMs);

  return {
    windowStart: new Date(windowStartMs),
    windowEnd: new Date(windowEndMs),
    windowIndex,
  };
}

/**
 * How many quota windows a period spans.
 * Open-ended periods return null (no finite count).
 * Fixed-term with null window days = 1 window for the whole period.
 */
export function countQuotaWindows(
  period: QuotaPeriodBounds,
  config: QuotaPlanWindowConfig,
): number | null {
  if (isNeverUntil(period.untilDate)) return null;

  const startMs = period.effectiveDate.getTime();
  const untilMs = period.untilDate.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(untilMs) ||
    untilMs <= startMs
  ) {
    return null;
  }

  const configured = truncPositiveDays(config.quotaWindowDays);
  if (configured == null) return 1;

  const windowMs = configured * MS_PER_DAY;
  const span = untilMs - startMs;
  return Math.max(1, Math.ceil(span / windowMs));
}

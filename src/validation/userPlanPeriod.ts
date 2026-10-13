import { Types } from "mongoose";
import type {
  AddPlanPeriodsDto,
  AdjustPeriodTokensDto,
  PlanPeriodEffectiveModeDto,
  PlanPeriodInputDto,
} from "../dto/userPlanPeriod.dto";

function parseIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be an ISO date string`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return d.toISOString();
}

function parseEffectiveMode(value: unknown): PlanPeriodEffectiveModeDto {
  if (value === undefined || value === null) return "absolute";
  if (value === "now" || value === "absolute") return value;
  throw new Error('effectiveMode must be "now" or "absolute"');
}

function parsePeriodItem(raw: unknown): PlanPeriodInputDto {
  if (!raw || typeof raw !== "object") {
    throw new Error("period must be an object");
  }
  const item = raw as Record<string, unknown>;
  if (typeof item.planId !== "string" || !Types.ObjectId.isValid(item.planId)) {
    throw new Error("planId must be a valid id");
  }
  const effectiveMode = parseEffectiveMode(item.effectiveMode);
  const untilDate = parseIsoDate(item.untilDate, "untilDate");

  if (effectiveMode === "now") {
    return {
      planId: item.planId,
      untilDate,
      effectiveMode: "now",
    };
  }

  return {
    planId: item.planId,
    effectiveDate: parseIsoDate(item.effectiveDate, "effectiveDate"),
    untilDate,
    effectiveMode: "absolute",
  };
}

export function parseAddPlanPeriodsDto(body: unknown): AddPlanPeriodsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;

  let periodsRaw: unknown[];
  if (Array.isArray(raw.periods)) {
    periodsRaw = raw.periods;
  } else if ("planId" in raw && "untilDate" in raw) {
    periodsRaw = [raw];
  } else {
    throw new Error("periods must be a non-empty array");
  }

  if (periodsRaw.length === 0) {
    throw new Error("periods must be a non-empty array");
  }

  const periods = periodsRaw.map(parsePeriodItem);
  const preserveRemainder =
    raw.preserveRemainder === undefined
      ? false
      : typeof raw.preserveRemainder === "boolean"
        ? raw.preserveRemainder
        : (() => {
            throw new Error("preserveRemainder must be a boolean");
          })();

  return { periods, preserveRemainder };
}

export function parsePlanPeriodId(value: unknown): string {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new Error("Invalid period id");
  }
  return value;
}

export function parseAdjustPeriodTokensDto(body: unknown): AdjustPeriodTokensDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.amount !== "number" ||
    !Number.isFinite(raw.amount) ||
    !Number.isInteger(raw.amount) ||
    raw.amount === 0
  ) {
    throw new Error("amount must be a non-zero integer");
  }
  if (typeof raw.reason !== "string" || !raw.reason.trim()) {
    throw new Error("reason is required");
  }
  return { amount: raw.amount, reason: raw.reason.trim() };
}

export function parsePlanPeriodListQuery(query: unknown): {
  page: number;
  pageSize: number;
} {
  const q =
    query && typeof query === "object"
      ? (query as Record<string, unknown>)
      : {};
  const pageRaw =
    typeof q.page === "string"
      ? Number.parseInt(q.page, 10)
      : typeof q.page === "number"
        ? q.page
        : 1;
  const sizeRaw =
    typeof q.pageSize === "string"
      ? Number.parseInt(q.pageSize, 10)
      : typeof q.pageSize === "number"
        ? q.pageSize
        : 10;
  return {
    page: Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1,
    pageSize: Number.isFinite(sizeRaw)
      ? Math.min(50, Math.max(1, Math.trunc(sizeRaw)))
      : 10,
  };
}

import { Types } from "mongoose";
import type {
  CreateAdminInvoiceDto,
  CreateInvoiceDto,
  MarkInvoicePaidDto,
} from "../dto/invoice.dto";
import { parseParam } from "./parseParam";

export function parseInvoiceId(
  param: string | string[] | undefined,
): string {
  const id = parseParam(param, { label: "Invoice id" });
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invoice not found");
  }
  return id;
}

export function parseCreateInvoiceDto(raw: unknown): CreateInvoiceDto {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid request body");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.planId !== "string" || !Types.ObjectId.isValid(body.planId)) {
    throw new Error("Invalid plan id");
  }
  return { planId: body.planId.trim() };
}

function parseNonNegInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  if (value < 0) throw new Error(`${field} must be >= 0`);
  return value;
}

export function parseCreateAdminInvoiceDto(raw: unknown): CreateAdminInvoiceDto {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid request body");
  }
  const body = raw as Record<string, unknown>;

  if (body.type !== "plan_purchase" && body.type !== "token_topup") {
    throw new Error("type must be plan_purchase or token_topup");
  }

  const dto: CreateAdminInvoiceDto = {
    type: body.type,
  };

  if (body.planId !== undefined) {
    if (typeof body.planId !== "string" || !Types.ObjectId.isValid(body.planId)) {
      throw new Error("Invalid plan id");
    }
    dto.planId = body.planId.trim();
  }

  if (body.amount !== undefined) {
    dto.amount = parseNonNegInt(body.amount, "amount");
  }

  if (body.expirePendingAndContinue !== undefined) {
    if (typeof body.expirePendingAndContinue !== "boolean") {
      throw new Error("expirePendingAndContinue must be a boolean");
    }
    dto.expirePendingAndContinue = body.expirePendingAndContinue;
  }

  if (body.type === "plan_purchase") {
    if (!dto.planId) {
      throw new Error("planId is required for plan_purchase");
    }
    if (body.startMode !== undefined) {
      if (body.startMode !== "immediate" && body.startMode !== "after_current") {
        throw new Error("startMode must be immediate or after_current");
      }
      dto.startMode = body.startMode;
    }
  } else {
    // token_topup is not a plan sale — ignore any planId from the client.
    delete dto.planId;
    if (
      typeof body.targetPeriodId !== "string" ||
      !Types.ObjectId.isValid(body.targetPeriodId)
    ) {
      throw new Error("targetPeriodId must be a valid period id");
    }
    dto.targetPeriodId = body.targetPeriodId;
    if (
      typeof body.deepseekTokens !== "number" ||
      !Number.isFinite(body.deepseekTokens) ||
      !Number.isInteger(body.deepseekTokens) ||
      body.deepseekTokens === 0
    ) {
      throw new Error("deepseekTokens must be a non-zero integer");
    }
    dto.deepseekTokens = body.deepseekTokens;
    if (body.allowFuturePeriod !== undefined) {
      if (typeof body.allowFuturePeriod !== "boolean") {
        throw new Error("allowFuturePeriod must be a boolean");
      }
      dto.allowFuturePeriod = body.allowFuturePeriod;
    }
  }

  return dto;
}

export function parseMarkInvoicePaidDto(raw: unknown): MarkInvoicePaidDto {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid request body");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.note !== "string" || !body.note.trim()) {
    throw new Error("note is required");
  }
  return { note: body.note.trim() };
}

function parsePositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value) && typeof value[0] === "string"
        ? value[0]
        : "";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseInvoiceListQuery(query: unknown): {
  page: number;
  pageSize: number;
} {
  const q =
    query && typeof query === "object"
      ? (query as Record<string, unknown>)
      : {};
  return {
    page: parsePositiveInt(q.page, 1, 1, 1_000_000),
    pageSize: parsePositiveInt(q.pageSize, 5, 1, 50),
  };
}

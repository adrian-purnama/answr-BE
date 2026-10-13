import { Types } from "mongoose";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";
import {
  ANALYTICS_OPTION_DIMENSIONS,
  type AnalyticsOptionDimension,
} from "../models/analyticsCategory/analyticsCategory.interface";
import type {
  CreateAnalyticsCategoryDto,
  UpdateAnalyticsCategoryDto,
} from "../dto/chatAnalytics.dto";
import type { AnalyticsGapGroup } from "../models/message/messageAnalytics.types";

const OPTION_DIMENSION_SET = new Set<string>(ANALYTICS_OPTION_DIMENSIONS);

function parseOptionSlug(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(`${field} must be a slug`);
  }
  return value;
}

export function parseAnalyticsOptionDimension(
  value: unknown,
): AnalyticsOptionDimension | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !OPTION_DIMENSION_SET.has(value)) {
    throw new Error(
      `dimension must be one of: ${ANALYTICS_OPTION_DIMENSIONS.join(", ")}`,
    );
  }
  return value as AnalyticsOptionDimension;
}

function parseOptionalDate(
  value: unknown,
  field: string,
): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${field} must be a date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return date;
}

function parsePositiveInt(
  value: unknown,
  field: string,
  fallback: number,
  max?: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`${field} must be a positive integer`);
  }
  if (max !== undefined && n > max) {
    throw new Error(`${field} must be <= ${max}`);
  }
  return n;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function parseAnalyticsRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Analytics id" });
}

export function parseCategoryRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Category id" });
}

export function parseCreateAnalyticsCategoryDto(
  body: unknown,
): CreateAnalyticsCategoryDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const apiKeyId = parseApiKeyId(raw.apiKeyId).toString();
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new Error("name must be a non-empty string");
  }
  const name = raw.name.trim();
  let slug: string | undefined;
  if (raw.slug !== undefined) {
    if (typeof raw.slug !== "string" || !raw.slug.trim()) {
      throw new Error("slug must be a non-empty string");
    }
    slug = slugify(raw.slug);
  } else {
    slug = slugify(name);
  }
  if (!slug) {
    throw new Error("slug must be a non-empty string");
  }
  if (typeof raw.description !== "string" || !raw.description.trim()) {
    throw new Error("description must be a non-empty string");
  }
  const description = raw.description.trim();
  const dimension = parseAnalyticsOptionDimension(raw.dimension);
  return { apiKeyId, name, slug, description, ...(dimension ? { dimension } : {}) };
}

export function parseUpdateAnalyticsCategoryDto(
  body: unknown,
): UpdateAnalyticsCategoryDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateAnalyticsCategoryDto = {};
  if ("name" in raw) {
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      throw new Error("name must be a non-empty string");
    }
    patch.name = raw.name.trim();
  }
  if ("description" in raw) {
    if (raw.description !== null && typeof raw.description !== "string") {
      throw new Error("description must be a string");
    }
    patch.description =
      typeof raw.description === "string"
        ? raw.description.trim() || undefined
        : undefined;
  }
  if ("isActive" in raw) {
    if (typeof raw.isActive !== "boolean") {
      throw new Error("isActive must be a boolean");
    }
    patch.isActive = raw.isActive;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

export function parseAnalyticsSummaryQuery(query: unknown): {
  apiKeyId: Types.ObjectId;
  from?: Date;
  to?: Date;
} {
  if (!query || typeof query !== "object") {
    throw new Error("Invalid query");
  }
  const raw = query as Record<string, unknown>;
  return {
    apiKeyId: new Types.ObjectId(parseApiKeyId(raw.apiKeyId)),
    from: parseOptionalDate(raw.from, "from"),
    to: parseOptionalDate(raw.to, "to"),
  };
}

export function parseAnalyticsTrendsQuery(query: unknown): {
  apiKeyId: Types.ObjectId;
  from?: Date;
  to?: Date;
  dimension: "category" | "gapType" | "type";
  limit: number;
} {
  if (!query || typeof query !== "object") {
    throw new Error("Invalid query");
  }
  const raw = query as Record<string, unknown>;
  let dimension: "category" | "gapType" | "type" = "category";
  if (raw.dimension !== undefined && raw.dimension !== "") {
    if (
      raw.dimension !== "category" &&
      raw.dimension !== "gapType" &&
      raw.dimension !== "type"
    ) {
      throw new Error("dimension must be category, gapType, or type");
    }
    dimension = raw.dimension;
  }
  return {
    apiKeyId: new Types.ObjectId(parseApiKeyId(raw.apiKeyId)),
    from: parseOptionalDate(raw.from, "from"),
    to: parseOptionalDate(raw.to, "to"),
    dimension,
    limit: parsePositiveInt(raw.limit, "limit", 10, 30),
  };
}

export function parseAnalyticsRecordsQuery(query: unknown): {
  apiKeyId: Types.ObjectId;
  from?: Date;
  to?: Date;
  categoryId?: Types.ObjectId;
  type?: string;
  answerable?: boolean;
  gapDetected?: boolean;
  gapResolved?: boolean;
  gapType?: string;
  gapGroup?: AnalyticsGapGroup;
  chatSessionId?: Types.ObjectId;
  page: number;
  pageSize: number;
} {
  if (!query || typeof query !== "object") {
    throw new Error("Invalid query");
  }
  const raw = query as Record<string, unknown>;
  const apiKeyId = new Types.ObjectId(parseApiKeyId(raw.apiKeyId));

  let categoryId: Types.ObjectId | undefined;
  if (raw.categoryId !== undefined && raw.categoryId !== "") {
    if (
      typeof raw.categoryId !== "string" ||
      !Types.ObjectId.isValid(raw.categoryId)
    ) {
      throw new Error("categoryId must be a valid id");
    }
    categoryId = new Types.ObjectId(raw.categoryId);
  }

  const type = parseOptionSlug(raw.type, "type");

  let answerable: boolean | undefined;
  if (raw.answerable !== undefined && raw.answerable !== "") {
    if (raw.answerable === "true" || raw.answerable === true) {
      answerable = true;
    } else if (raw.answerable === "false" || raw.answerable === false) {
      answerable = false;
    } else {
      throw new Error("answerable must be true or false");
    }
  }

  let gapDetected: boolean | undefined;
  if (raw.gapDetected !== undefined && raw.gapDetected !== "") {
    if (raw.gapDetected === "true" || raw.gapDetected === true) {
      gapDetected = true;
    } else if (raw.gapDetected === "false" || raw.gapDetected === false) {
      gapDetected = false;
    } else {
      throw new Error("gapDetected must be true or false");
    }
  }

  let gapResolved: boolean | undefined;
  if (raw.gapResolved !== undefined && raw.gapResolved !== "") {
    if (raw.gapResolved === "true" || raw.gapResolved === true) {
      gapResolved = true;
    } else if (raw.gapResolved === "false" || raw.gapResolved === false) {
      gapResolved = false;
    } else {
      throw new Error("gapResolved must be true or false");
    }
  }

  const gapType = parseOptionSlug(raw.gapType, "gapType");

  let gapGroup: AnalyticsGapGroup | undefined;
  if (raw.gapGroup !== undefined && raw.gapGroup !== "") {
    if (raw.gapGroup !== "knowledge" && raw.gapGroup !== "failure") {
      throw new Error("gapGroup must be knowledge or failure");
    }
    gapGroup = raw.gapGroup;
  }

  let chatSessionId: Types.ObjectId | undefined;
  if (raw.chatSessionId !== undefined && raw.chatSessionId !== "") {
    if (
      typeof raw.chatSessionId !== "string" ||
      !Types.ObjectId.isValid(raw.chatSessionId)
    ) {
      throw new Error("chatSessionId must be a valid id");
    }
    chatSessionId = new Types.ObjectId(raw.chatSessionId);
  }

  return {
    apiKeyId,
    from: parseOptionalDate(raw.from, "from"),
    to: parseOptionalDate(raw.to, "to"),
    categoryId,
    type,
    answerable,
    gapDetected,
    gapResolved,
    gapType,
    gapGroup,
    chatSessionId,
    page: parsePositiveInt(raw.page, "page", 1),
    pageSize: parsePositiveInt(raw.pageSize, "pageSize", 20, 100),
  };
}

import { Types } from "mongoose";
import type {
  BulkBatchTestQuestionIdsDto,
  CreateBatchTestGroupDto,
  CreateBatchTestQuestionDto,
  SetBatchTestRatingDto,
  UpdateBatchTestGroupDto,
  UpdateBatchTestQuestionDto,
} from "../dto/batchTest.dto";
import { BATCH_TEST_RATING_VALUES } from "../models/batchTest/batchTestQuestion.interface";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function parseBatchTestGroupId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Batch test group id" });
}

export function parseBatchTestQuestionId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Batch test question id" });
}

export function parseCreateBatchTestGroupDto(
  body: unknown,
): CreateBatchTestGroupDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    name: parseNonEmptyString(raw.name, "name"),
  };
}

export function parseUpdateBatchTestGroupDto(
  body: unknown,
): UpdateBatchTestGroupDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    name: parseNonEmptyString(raw.name, "name"),
  };
}

export function parseCreateBatchTestQuestionDto(
  body: unknown,
): CreateBatchTestQuestionDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    questionText: parseNonEmptyString(raw.questionText, "questionText"),
  };
}

export function parseUpdateBatchTestQuestionDto(
  body: unknown,
): UpdateBatchTestQuestionDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    questionText: parseNonEmptyString(raw.questionText, "questionText"),
  };
}

export function parseBulkBatchTestQuestionIdsDto(
  body: unknown,
): BulkBatchTestQuestionIdsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.questionIds)) {
    throw new Error("questionIds must be an array");
  }
  if (raw.questionIds.length === 0) {
    throw new Error("questionIds must not be empty");
  }

  const unique = new Set<string>();
  for (const id of raw.questionIds) {
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
      throw new Error("questionIds must contain valid ObjectId strings");
    }
    unique.add(id);
  }

  return { questionIds: [...unique] };
}

export function parseSetBatchTestRatingDto(
  body: unknown,
): SetBatchTestRatingDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.rating !== "string" ||
    !(BATCH_TEST_RATING_VALUES as readonly string[]).includes(raw.rating)
  ) {
    throw new Error("rating must be one of: good, passable, poor");
  }
  return {
    rating: raw.rating as SetBatchTestRatingDto["rating"],
  };
}

import type {
  CreateGuidanceDto,
  UpdateGuidanceDto,
} from "../dto/guidance.dto";
import { GUIDANCE_TITLE_MAX } from "../models/guidance/guidance.model";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("title must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > GUIDANCE_TITLE_MAX) {
    throw new Error(`title must be at most ${GUIDANCE_TITLE_MAX} characters`);
  }
  return trimmed;
}

function parseContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("content must be a string");
  }
  // Do not trim    leading/trailing Enter / blank lines must round-trip.
  return value;
}

export function parseCreateGuidanceDto(body: unknown): CreateGuidanceDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    title: parseTitle(raw.title),
    content: parseContent(raw.content ?? ""),
  };
}

export function parseUpdateGuidanceDto(body: unknown): UpdateGuidanceDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateGuidanceDto = {};

  if ("title" in raw) patch.title = parseTitle(raw.title);
  if ("content" in raw) patch.content = parseContent(raw.content);
  if ("enabled" in raw) {
    if (typeof raw.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = raw.enabled;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseGuidanceRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Guidance id", objectId: true });
}

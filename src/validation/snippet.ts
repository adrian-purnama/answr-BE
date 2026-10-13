import type {
  CreateSnippetDto,
  UpdateSnippetDto,
} from "../dto/snippet.dto";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";
import { parseTopicName } from "./topic";

function parseContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("topicContent must be a string");
  }
  return value;
}

export function parseCreateSnippetDto(body: unknown): CreateSnippetDto {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    topicName: parseTopicName(raw.topicName),
    topicContent: parseContent(raw.topicContent ?? ""),
  };
}

function parseBooleanField(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${field} must be a boolean`);
}

export function parseUpdateSnippetDto(body: unknown): UpdateSnippetDto {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateSnippetDto = {};

  if ("topicName" in raw) patch.topicName = parseTopicName(raw.topicName);
  if ("topicContent" in raw) patch.topicContent = parseContent(raw.topicContent);
  if ("enabled" in raw) {
    patch.enabled = parseBooleanField(raw.enabled, "enabled");
  }
  if ("order" in raw) {
    const order =
      typeof raw.order === "number" ? raw.order : Number(raw.order);
    if (!Number.isFinite(order) || order < 0) {
      throw new Error("order must be a number >= 0");
    }
    patch.order = Math.floor(order);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseSnippetRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Snippet id", objectId: true });
}

/** `?force=true` re-embeds every snippet instead of only pending ones. */
export function parseForceQuery(value: unknown): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("force must be true or false");
}

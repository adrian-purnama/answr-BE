import type {
  CreateArticleDto,
  ImportArticleDto,
  UpdateArticleDto,
} from "../dto/article.dto";
import {
  ARTICLE_DESCRIPTION_MAX,
  ARTICLE_TITLE_MAX,
} from "../models/article/article.model";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("title must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > ARTICLE_TITLE_MAX) {
    throw new Error(`title must be at most ${ARTICLE_TITLE_MAX} characters`);
  }
  return trimmed;
}

function parseDescription(value: unknown, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new Error("description must be a string");
    return "";
  }
  if (typeof value !== "string") {
    throw new Error("description must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length > ARTICLE_DESCRIPTION_MAX) {
    throw new Error(
      `description must be at most ${ARTICLE_DESCRIPTION_MAX} characters`,
    );
  }
  return trimmed;
}

export function parseCreateArticleDto(body: unknown): CreateArticleDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    title: parseTitle(raw.title),
    description: parseDescription(raw.description),
  };
}

export function parseUpdateArticleDto(body: unknown): UpdateArticleDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateArticleDto = {};

  if ("title" in raw) patch.title = parseTitle(raw.title);
  if ("description" in raw) patch.description = parseDescription(raw.description, true);
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

export function parseImportArticleDto(body: unknown): ImportArticleDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.markdown !== "string" || !raw.markdown.trim()) {
    throw new Error("markdown must be a non-empty string");
  }
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    markdown: raw.markdown,
  };
}

export function parseArticleRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Article id", objectId: true });
}

/** `?force=true` re-embeds every topic in scope instead of only pending ones. */
export function parseForceQuery(value: unknown): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("force must be true or false");
}

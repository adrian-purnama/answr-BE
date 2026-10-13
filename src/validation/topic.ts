import type {
  CreateTopicDto,
  ReorderTopicsDto,
  UpdateTopicDto,
} from "../dto/topic.dto";
import { Types } from "mongoose";
import { TOPIC_NAME_MAX } from "../models/topic/topic.model";
import {
  countImageBlocks,
  countTopicCharacters,
  parseContentToBlocks,
  serializeContentBlocks,
  type ContentBlock,
} from "../utils/contentReferences";
import { parseParam } from "./parseParam";

export const MAX_TOPIC_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOPIC_IMAGE_ALT = 200;

export function parseTopicName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("topicName must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > TOPIC_NAME_MAX) {
    throw new Error(`topicName must be at most ${TOPIC_NAME_MAX} characters`);
  }
  return trimmed;
}

function mediaIdToString(value: unknown): string | null {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }
  if (typeof value === "string" && value.trim() && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value.trim()).toString();
  }
  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    const asString = (value as { toString: () => string }).toString();
    if (Types.ObjectId.isValid(asString)) {
      return new Types.ObjectId(asString).toString();
    }
  }
  return null;
}

function optionalAlt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_TOPIC_IMAGE_ALT);
}

/** Convert legacy block arrays (text/image with mediaId) to content-reference blocks. */
function legacyArrayToBlocks(value: unknown[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (raw.type === "text" && typeof raw.content === "string") {
      blocks.push({ type: "text", content: raw.content });
      continue;
    }
    if (raw.type === "image") {
      const id =
        (typeof raw.id === "string" && raw.id.trim()) ||
        (typeof raw.fileKey === "string" && raw.fileKey.trim()) ||
        mediaIdToString(raw.mediaId);
      if (!id) continue;
      const alt = optionalAlt(raw.alt);
      blocks.push(alt ? { type: "image", id, alt } : { type: "image", id });
      continue;
    }
    if (raw.type === "topic" && typeof raw.id === "string" && raw.id.trim()) {
      blocks.push({ type: "topic", id: raw.id.trim() });
      continue;
    }
    if (raw.type === "tool" && typeof raw.name === "string" && raw.name.trim()) {
      blocks.push({ type: "tool", name: raw.name.trim() });
    }
  }
  return blocks;
}

/** Persistable token string. Accepts a string or a legacy JSON/array of blocks. */
export function topicContentToString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value === "" ? "" : value;
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return serializeContentBlocks(legacyArrayToBlocks(parsed));
        }
      } catch {
        // already a token/markdown string
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return serializeContentBlocks(legacyArrayToBlocks(value));
  }
  return "";
}

/** Parse stored/legacy topicContent into ordered blocks. */
export function coerceTopicContent(value: unknown): ContentBlock[] {
  return parseContentToBlocks(topicContentToString(value));
}

/** Parse topicContent from multipart form field (string) or body. */
export function parseTopicContentField(value: unknown): string {
  if (value === undefined || value === null) return "";
  return topicContentToString(value);
}

export { countImageBlocks, countTopicCharacters };

export function mediaIdsFromContent(content: string): string[] {
  return mediaIdsFromBlocks(parseContentToBlocks(content));
}

export function mediaIdsFromBlocks(blocks: ContentBlock[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type === "image" && Types.ObjectId.isValid(block.id)) {
      ids.push(block.id);
    }
  }
  return ids;
}

export function parseCreateTopicDto(body: unknown): CreateTopicDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    topicName: parseTopicName(raw.topicName),
    topicContent: parseTopicContentField(raw.topicContent),
  };
}

export function parseUpdateTopicDto(body: unknown): UpdateTopicDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateTopicDto = {};

  if ("topicName" in raw) patch.topicName = parseTopicName(raw.topicName);
  if ("topicContent" in raw)
    patch.topicContent = parseTopicContentField(raw.topicContent);
  if ("enabled" in raw) {
    const enabled =
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : raw.enabled === "true"
          ? true
          : raw.enabled === "false"
            ? false
            : null;
    if (enabled === null) {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = enabled;
  }
  if ("order" in raw) {
    const order =
      typeof raw.order === "number" ? raw.order : Number(raw.order);
    if (!Number.isFinite(order) || order < 0) {
      throw new Error("order must be a number >= 0");
    }
    patch.order = order;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseReorderTopicsDto(body: unknown): ReorderTopicsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.topicIds) || raw.topicIds.length === 0) {
    throw new Error("topicIds must be a non-empty array");
  }

  const topicIds = raw.topicIds.map((id, index) => {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error(`topicIds[${index}] must be a non-empty string`);
    }
    return parseParam(id, { label: "Topic id", objectId: true });
  });

  return { topicIds };
}

export function parseTopicRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Topic id", objectId: true });
}

export function assertImageFile(file: Express.Multer.File): void {
  if (!file.mimetype.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }
  if (file.size > MAX_TOPIC_IMAGE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }
}

import { Types } from "mongoose";
import type { CreateApiKeyDto, UpdateApiKeyDto } from "../dto/apiKey.dto";
import { parseParam } from "./parseParam";

const LABEL_MAX = 64;
const DESCRIPTION_MAX = 500;

function parseLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("label must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > LABEL_MAX) {
    throw new Error(`label must be at most ${LABEL_MAX} characters`);
  }
  return trimmed;
}

function parseDescription(value: unknown, defaultValue = ""): string {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string") {
    throw new Error("description must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new Error(`description must be at most ${DESCRIPTION_MAX} characters`);
  }
  return trimmed;
}

function parseIpAllowlist(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("ipAllowlist must be an array of strings");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`ipAllowlist[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

export function parseCreateApiKeyDto(body: unknown): CreateApiKeyDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    label: parseLabel(raw.label),
    description: parseDescription(raw.description, ""),
    ipAllowlist: parseIpAllowlist(raw.ipAllowlist),
  };
}

export function parseUpdateApiKeyDto(body: unknown): UpdateApiKeyDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateApiKeyDto = {};

  if ("label" in raw) patch.label = parseLabel(raw.label);
  if ("description" in raw) patch.description = parseDescription(raw.description);
  if ("ipAllowlist" in raw) patch.ipAllowlist = parseIpAllowlist(raw.ipAllowlist);
  if ("enhancedRetrieval" in raw) {
    patch.enhancedRetrieval = parseBoolean(raw.enhancedRetrieval, "enhancedRetrieval");
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseRouteId(param: string | string[] | undefined): string {
  return parseParam(param, { label: "API key id", objectId: true });
}

export function parseApiKeyId(raw: unknown): Types.ObjectId {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string") {
    throw new Error("Invalid API key id");
  }
  return new Types.ObjectId(parseRouteId(id));
}

export function parseApiKeyIdQuery(raw: unknown): string {
  return parseApiKeyId(raw).toString();
}

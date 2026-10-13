import type {
  CreateUiTemplateDto,
  GenerateUiTemplateFromToolDto,
  UpdateUiTemplateDto,
} from "../dto/uiTemplate.dto";
import { UI_TEMPLATE_NAME_MAX } from "../models/uiTemplate/uiTemplate.model";
import { parseUiTemplateDefinition } from "../utils/uiDescSchema";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";
import { Types } from "mongoose";

function parseName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("name must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > UI_TEMPLATE_NAME_MAX) {
    throw new Error(
      `name must be at most ${UI_TEMPLATE_NAME_MAX} characters`,
    );
  }
  return trimmed;
}

function parseDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error("description must be a string");
  }
  return value.trim();
}

function parseDefinition(value: unknown): Record<string, unknown> {
  const parsed = parseUiTemplateDefinition(value);
  if (!parsed.success) {
    throw new Error("definition must be a valid UI template (version 1)");
  }
  return parsed.data as unknown as Record<string, unknown>;
}

function parseObjectIdField(value: unknown, label: string): string {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function parseCreateUiTemplateDto(body: unknown): CreateUiTemplateDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    name: parseName(raw.name),
    description: parseDescription(raw.description),
    definition: parseDefinition(raw.definition),
  };
}

export function parseUpdateUiTemplateDto(body: unknown): UpdateUiTemplateDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateUiTemplateDto = {};
  if ("name" in raw) patch.name = parseName(raw.name);
  if ("description" in raw) patch.description = parseDescription(raw.description);
  if ("definition" in raw) patch.definition = parseDefinition(raw.definition);
  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

export function parseGenerateUiTemplateFromToolDto(
  body: unknown,
): GenerateUiTemplateFromToolDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    mcpId: parseObjectIdField(raw.mcpId, "MCP id"),
    toolId: parseObjectIdField(raw.toolId, "MCP tool id"),
  };
}

export function parseUiTemplateRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "UI template id", objectId: true });
}

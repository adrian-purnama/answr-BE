import { randomUUID } from "crypto";
import type { UpdateLeadCaptureSettingsDto } from "../dto/leadCapture.dto";
import {
  LEAD_CAPTURE_STRATEGY_VALUES,
  LEAD_FIELD_TYPE_VALUES,
  type LeadCaptureStrategy,
  type LeadFieldConfig,
  type LeadFieldType,
} from "../models/leadCapture/leadCapture.interface";

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_FIELDS = 20;
const MAX_LABEL = 80;

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function parseStrategy(value: unknown): LeadCaptureStrategy {
  if (
    typeof value !== "string" ||
    !LEAD_CAPTURE_STRATEGY_VALUES.includes(value as LeadCaptureStrategy)
  ) {
    throw new Error("strategy must be subtle, aggressive, or adaptive");
  }
  return value as LeadCaptureStrategy;
}

function parseField(value: unknown, index: number): LeadFieldConfig {
  if (!value || typeof value !== "object") {
    throw new Error(`fields[${index}] must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const key =
    typeof raw.key === "string" ? raw.key.trim().toLowerCase() : "";
  if (!KEY_RE.test(key)) {
    throw new Error(
      `fields[${index}].key must be snake_case and start with a letter`,
    );
  }
  const label =
    typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL) : "";
  if (!label) {
    throw new Error(`fields[${index}].label is required`);
  }
  const type = raw.type;
  if (
    typeof type !== "string" ||
    !LEAD_FIELD_TYPE_VALUES.includes(type as LeadFieldType)
  ) {
    throw new Error(`fields[${index}].type is invalid`);
  }
  const id =
    typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : randomUUID();
  return {
    id,
    key,
    label,
    type: type as LeadFieldType,
    required: parseBoolean(raw.required, `fields[${index}].required`),
    order: index,
  };
}

function parseFields(value: unknown): LeadFieldConfig[] {
  if (!Array.isArray(value)) {
    throw new Error("fields must be an array");
  }
  if (value.length > MAX_FIELDS) {
    throw new Error(`fields is limited to ${MAX_FIELDS}`);
  }
  const fields = value.map((item, index) => parseField(item, index));
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) {
      throw new Error(`Duplicate field key: ${field.key}`);
    }
    seen.add(field.key);
  }
  return fields;
}

export function parseUpdateLeadCaptureSettingsDto(
  body: unknown,
): UpdateLeadCaptureSettingsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateLeadCaptureSettingsDto = {};
  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "enabled");
  }
  if ("strategy" in raw) {
    patch.strategy = parseStrategy(raw.strategy);
  }
  if ("fields" in raw) {
    patch.fields = parseFields(raw.fields);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

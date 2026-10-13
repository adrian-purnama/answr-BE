import type {
  CreateLiveAgentDto,
  LiveAgentLoginDto,
  LiveAgentResilience,
  ResetLiveAgentPasswordDto,
  UpdateLiveAgentDto,
  UpdateLiveAgentSettingsDto,
} from "../dto/liveAgent.dto";
import { LIVE_AGENT_RESILIENCE_VALUES } from "../dto/liveAgent.dto";
import { parseApiKeyId } from "./apiKey";
import { parseParam } from "./parseParam";

const MIN_PASSWORD_LENGTH = 8;

function parseName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("name must be a non-empty string");
  }
  return value.trim();
}

function parseCode(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("code must be a non-empty string");
  }
  return value.trim().toUpperCase();
}

export function parseLiveAgentPassword(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("password must be a non-empty string");
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  return value;
}

export function parseCreateLiveAgentDto(body: unknown): CreateLiveAgentDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const dto: CreateLiveAgentDto = {
    apiKeyId: parseApiKeyId(raw.apiKeyId).toString(),
    name: parseName(raw.name),
    password: parseLiveAgentPassword(raw.password),
  };
  if ("enabled" in raw) {
    if (typeof raw.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    dto.enabled = raw.enabled;
  }
  return dto;
}

export function parseUpdateLiveAgentDto(body: unknown): UpdateLiveAgentDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateLiveAgentDto = {};

  if ("name" in raw) patch.name = parseName(raw.name);
  if ("enabled" in raw) {
    if (typeof raw.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = raw.enabled;
  }
  if ("profilePicture" in raw) {
    if (typeof raw.profilePicture !== "string") {
      throw new Error("profilePicture must be a string");
    }
    patch.profilePicture = raw.profilePicture.trim();
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseResetLiveAgentPasswordDto(
  body: unknown,
): ResetLiveAgentPasswordDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  return {
    password: parseLiveAgentPassword(raw.password),
  };
}

export function parseLiveAgentRouteId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Live agent id", objectId: true });
}

export function parseLiveAgentMediaId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Media id", objectId: true });
}

export function parseLiveAgentLoginDto(body: unknown): LiveAgentLoginDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.password !== "string" || !raw.password) {
    throw new Error("password must be a non-empty string");
  }
  return {
    name: parseName(raw.name),
    password: raw.password,
    code: parseCode(raw.code),
  };
}

function parseResilience(value: unknown): LiveAgentResilience {
  if (
    typeof value !== "string" ||
    !(LIVE_AGENT_RESILIENCE_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error("resilience must be one of: low, medium, high, never");
  }
  return value as LiveAgentResilience;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseNotifyEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("notifyEmail must be a string");
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (!EMAIL_RE.test(trimmed)) {
    throw new Error("notifyEmail must be a valid email address");
  }
  return trimmed;
}

export function parseUpdateLiveAgentSettingsDto(
  body: unknown,
): UpdateLiveAgentSettingsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateLiveAgentSettingsDto = {};

  if ("enabled" in raw) {
    if (typeof raw.enabled !== "boolean") {
      throw new Error("enabled must be a boolean");
    }
    patch.enabled = raw.enabled;
  }
  if ("resilience" in raw) {
    patch.resilience = parseResilience(raw.resilience);
  }
  if ("notifyEmail" in raw) {
    patch.notifyEmail = parseNotifyEmail(raw.notifyEmail);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

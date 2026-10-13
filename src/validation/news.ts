import { Types } from "mongoose";
import type {
  CreateNewsDto,
  NewsCtaDto,
  UpdateNewsDto,
} from "../dto/news.dto";
import { isHttpUrl, isNewsContentEmpty, sanitizeNewsHtml } from "../utils/newsHtml";

const TITLE_MAX = 200;
const CONTENT_MAX = 100_000;
const CTA_TEXT_MAX = 80;

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("title is required");
  }
  const trimmed = value.trim();
  if (trimmed.length > TITLE_MAX) {
    throw new Error(`title must be at most ${TITLE_MAX} characters`);
  }
  return trimmed;
}

function parseContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("content is required");
  }
  if (value.length > CONTENT_MAX) {
    throw new Error(`content must be at most ${CONTENT_MAX} characters`);
  }
  const sanitized = sanitizeNewsHtml(value);
  if (isNewsContentEmpty(sanitized)) {
    throw new Error("content is required");
  }
  return sanitized;
}

function parseHeroImage(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error("heroImage must be a string");
  }
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!Types.ObjectId.isValid(trimmed)) {
    throw new Error("heroImage is invalid");
  }
  return trimmed;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function parseCta(value: unknown): NewsCtaDto {
  if (value === undefined || value === null) {
    return { enabled: false, text: "", url: "" };
  }
  if (typeof value !== "object") {
    throw new Error("cta must be an object");
  }
  const raw = value as Record<string, unknown>;
  const enabled =
    raw.enabled === undefined ? false : parseBoolean(raw.enabled, "cta.enabled");
  const text =
    raw.text === undefined
      ? ""
      : typeof raw.text === "string"
        ? raw.text.trim()
        : (() => {
            throw new Error("cta.text must be a string");
          })();
  if (text.length > CTA_TEXT_MAX) {
    throw new Error(`cta.text must be at most ${CTA_TEXT_MAX} characters`);
  }
  const url =
    raw.url === undefined
      ? ""
      : typeof raw.url === "string"
        ? raw.url.trim()
        : (() => {
            throw new Error("cta.url must be a string");
          })();

  if (url && !isHttpUrl(url)) {
    throw new Error("cta.url must be a valid http(s) URL");
  }
  if (enabled) {
    if (!text) throw new Error("cta.text is required when the button is enabled");
    if (!url) throw new Error("cta.url is required when the button is enabled");
    return { enabled: true, text, url };
  }
  return { enabled: false, text, url };
}

export function parseCreateNewsDto(body: unknown): CreateNewsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const dto: CreateNewsDto = {
    title: parseTitle(raw.title),
    content: parseContent(raw.content),
    heroImage: parseHeroImage(raw.heroImage),
    cta: parseCta(raw.cta),
  };
  if (raw.enabled !== undefined) {
    dto.enabled = parseBoolean(raw.enabled, "enabled");
  }
  return dto;
}

export function parseUpdateNewsDto(body: unknown): UpdateNewsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateNewsDto = {};
  if ("title" in raw) patch.title = parseTitle(raw.title);
  if ("content" in raw) patch.content = parseContent(raw.content);
  if ("heroImage" in raw) patch.heroImage = parseHeroImage(raw.heroImage);
  if ("cta" in raw) patch.cta = parseCta(raw.cta);
  if ("enabled" in raw) patch.enabled = parseBoolean(raw.enabled, "enabled");
  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

export function parseNewsId(param: string | string[] | undefined): string {
  const id = Array.isArray(param) ? param[0] : param;
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new Error("News not found");
  }
  return id;
}

export function parseNewsLimitQuery(raw: unknown, fallback = 20): number {
  if (raw === undefined) return fallback;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("limit must be a number");
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

import type { CreatePlanDto, UpdatePlanDto } from "../dto/plan.dto";
import { parseParam } from "./parseParam";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseNumber(value: unknown, field: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`${field} must be a number >= ${min}`);
  }
  return value;
}

/** null clears to whole-period windows; otherwise a positive day count. */
function parseQuotaWindowDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error("quotaWindowDays must be null or a number >= 1");
  }
  return Math.trunc(value);
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function parseAccentColor(value: unknown): string {
  const color = parseString(value, "accentColor");
  if (!HEX_COLOR_RE.test(color)) {
    throw new Error("accentColor must be a valid hex color");
  }
  return color;
}

export function parseCreatePlanDto(body: unknown): CreatePlanDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;

  return {
    slug: parseString(raw.slug, "slug").toLowerCase(),
    name: parseString(raw.name, "name"),
    description: parseString(raw.description, "description"),
    pricePerMonth: parseNumber(raw.pricePerMonth, "pricePerMonth"),
    priceLabel: parseNumber(raw.priceLabel, "priceLabel"),
    priceNote: parseString(raw.priceNote, "priceNote"),
    maxApiKeys: parseNumber(raw.maxApiKeys, "maxApiKeys", 0),
    maxRequestsPerMinute: parseNumber(
      raw.maxRequestsPerMinute,
      "maxRequestsPerMinute",
      0,
    ),
    maxArticles: parseNumber(raw.maxArticles, "maxArticles", 0),
    maxTopicsPerArticle: parseNumber(
      raw.maxTopicsPerArticle,
      "maxTopicsPerArticle",
      0,
    ),
    maxImagesPerTopic: parseNumber(
      raw.maxImagesPerTopic,
      "maxImagesPerTopic",
      0,
    ),
    maxCharactersPerTopic: parseNumber(
      raw.maxCharactersPerTopic,
      "maxCharactersPerTopic",
      0,
    ),
    maxSnippets: parseNumber(raw.maxSnippets, "maxSnippets", 0),
    maxImagesPerSnippet: parseNumber(
      raw.maxImagesPerSnippet,
      "maxImagesPerSnippet",
      0,
    ),
    maxCharactersPerSnippet: parseNumber(
      raw.maxCharactersPerSnippet,
      "maxCharactersPerSnippet",
      0,
    ),
    maxGuidances: parseNumber(raw.maxGuidances, "maxGuidances", 0),
    maxCharactersPerGuidance: parseNumber(
      raw.maxCharactersPerGuidance,
      "maxCharactersPerGuidance",
      0,
    ),
    maxLiveAgents: parseNumber(raw.maxLiveAgents, "maxLiveAgents", 0),
    liveAgent: parseBoolean(raw.liveAgent, "liveAgent"),
    meetingTool: parseBoolean(raw.meetingTool, "meetingTool"),
    leadCapture: parseBoolean(raw.leadCapture, "leadCapture"),
    whatsApp: parseBoolean(raw.whatsApp, "whatsApp"),
    maxMeetingTopics: parseNumber(raw.maxMeetingTopics, "maxMeetingTopics", 0),
    batchTestGroupAmount: parseNumber(
      raw.batchTestGroupAmount,
      "batchTestGroupAmount",
      0,
    ),
    questionsPerBatchTestGroup: parseNumber(
      raw.questionsPerBatchTestGroup,
      "questionsPerBatchTestGroup",
      0,
    ),
    analyticsLookbackDays: parseNumber(
      raw.analyticsLookbackDays,
      "analyticsLookbackDays",
      0,
    ),
    deepseekQuotaPerPeriod: parseNumber(
      raw.deepseekQuotaPerPeriod,
      "deepseekQuotaPerPeriod",
      0,
    ),
    quotaWindowDays: parseQuotaWindowDays(raw.quotaWindowDays),
    accentColor: parseAccentColor(raw.accentColor),
    order: parseNumber(raw.order, "order"),
    showOnPricingPage: parseBoolean(raw.showOnPricingPage, "showOnPricingPage"),
    isDefaultPlan: parseBoolean(raw.isDefaultPlan, "isDefaultPlan"),
    isActive: parseBoolean(raw.isActive, "isActive"),
  };
}

export function parseUpdatePlanDto(body: unknown): UpdatePlanDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdatePlanDto = {};

  if ("slug" in raw) patch.slug = parseString(raw.slug, "slug").toLowerCase();
  if ("name" in raw) patch.name = parseString(raw.name, "name");
  if ("description" in raw)
    patch.description = parseString(raw.description, "description");
  if ("pricePerMonth" in raw)
    patch.pricePerMonth = parseNumber(raw.pricePerMonth, "pricePerMonth");
  if ("priceLabel" in raw)
    patch.priceLabel = parseNumber(raw.priceLabel, "priceLabel");
  if ("priceNote" in raw) patch.priceNote = parseString(raw.priceNote, "priceNote");
  if ("maxApiKeys" in raw)
    patch.maxApiKeys = parseNumber(raw.maxApiKeys, "maxApiKeys", 0);
  if ("maxRequestsPerMinute" in raw)
    patch.maxRequestsPerMinute = parseNumber(
      raw.maxRequestsPerMinute,
      "maxRequestsPerMinute",
      0,
    );
  if ("maxArticles" in raw)
    patch.maxArticles = parseNumber(raw.maxArticles, "maxArticles", 0);
  if ("maxTopicsPerArticle" in raw)
    patch.maxTopicsPerArticle = parseNumber(
      raw.maxTopicsPerArticle,
      "maxTopicsPerArticle",
      0,
    );
  if ("maxImagesPerTopic" in raw)
    patch.maxImagesPerTopic = parseNumber(
      raw.maxImagesPerTopic,
      "maxImagesPerTopic",
      0,
    );
  if ("maxCharactersPerTopic" in raw)
    patch.maxCharactersPerTopic = parseNumber(
      raw.maxCharactersPerTopic,
      "maxCharactersPerTopic",
      0,
    );
  if ("maxSnippets" in raw)
    patch.maxSnippets = parseNumber(raw.maxSnippets, "maxSnippets", 0);
  if ("maxImagesPerSnippet" in raw)
    patch.maxImagesPerSnippet = parseNumber(
      raw.maxImagesPerSnippet,
      "maxImagesPerSnippet",
      0,
    );
  if ("maxCharactersPerSnippet" in raw)
    patch.maxCharactersPerSnippet = parseNumber(
      raw.maxCharactersPerSnippet,
      "maxCharactersPerSnippet",
      0,
    );
  if ("maxGuidances" in raw)
    patch.maxGuidances = parseNumber(raw.maxGuidances, "maxGuidances", 0);
  if ("maxCharactersPerGuidance" in raw)
    patch.maxCharactersPerGuidance = parseNumber(
      raw.maxCharactersPerGuidance,
      "maxCharactersPerGuidance",
      0,
    );
  if ("maxLiveAgents" in raw)
    patch.maxLiveAgents = parseNumber(raw.maxLiveAgents, "maxLiveAgents", 0);
  if ("liveAgent" in raw)
    patch.liveAgent = parseBoolean(raw.liveAgent, "liveAgent");
  if ("meetingTool" in raw)
    patch.meetingTool = parseBoolean(raw.meetingTool, "meetingTool");
  if ("leadCapture" in raw)
    patch.leadCapture = parseBoolean(raw.leadCapture, "leadCapture");
  if ("whatsApp" in raw)
    patch.whatsApp = parseBoolean(raw.whatsApp, "whatsApp");
  if ("maxMeetingTopics" in raw)
    patch.maxMeetingTopics = parseNumber(
      raw.maxMeetingTopics,
      "maxMeetingTopics",
      0,
    );
  if ("batchTestGroupAmount" in raw)
    patch.batchTestGroupAmount = parseNumber(
      raw.batchTestGroupAmount,
      "batchTestGroupAmount",
      0,
    );
  if ("questionsPerBatchTestGroup" in raw)
    patch.questionsPerBatchTestGroup = parseNumber(
      raw.questionsPerBatchTestGroup,
      "questionsPerBatchTestGroup",
      0,
    );
  if ("analyticsLookbackDays" in raw)
    patch.analyticsLookbackDays = parseNumber(
      raw.analyticsLookbackDays,
      "analyticsLookbackDays",
      0,
    );
  if ("deepseekQuotaPerPeriod" in raw)
    patch.deepseekQuotaPerPeriod = parseNumber(
      raw.deepseekQuotaPerPeriod,
      "deepseekQuotaPerPeriod",
      0,
    );
  if ("quotaWindowDays" in raw)
    patch.quotaWindowDays = parseQuotaWindowDays(raw.quotaWindowDays);
  if ("accentColor" in raw) patch.accentColor = parseAccentColor(raw.accentColor);
  if ("order" in raw) patch.order = parseNumber(raw.order, "order");
  if ("showOnPricingPage" in raw)
    patch.showOnPricingPage = parseBoolean(
      raw.showOnPricingPage,
      "showOnPricingPage",
    );
  if ("isDefaultPlan" in raw)
    patch.isDefaultPlan = parseBoolean(raw.isDefaultPlan, "isDefaultPlan");
  if ("isActive" in raw) patch.isActive = parseBoolean(raw.isActive, "isActive");

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function parseRouteId(param: string | string[] | undefined): string {
  return parseParam(param, { label: "Plan id" });
}

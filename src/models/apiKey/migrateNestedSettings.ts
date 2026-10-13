import { Types } from "mongoose";
import { ApiKeyModel } from "./apiKey.model";
import { logger } from "../../logger/logger";
import type { LeadCaptureStrategy, LeadFieldConfig } from "../leadCapture/leadCapture.interface";
import { LEAD_CAPTURE_STRATEGY_VALUES, LEAD_FIELD_TYPE_VALUES } from "../leadCapture/leadCapture.interface";

const RESILIENCE = new Set(["low", "medium", "high", "never"]);
const STRATEGIES = new Set<string>(LEAD_CAPTURE_STRATEGY_VALUES);
const FIELD_TYPES = new Set<string>(LEAD_FIELD_TYPE_VALUES);
const FLAT_LIVE_AGENT_FIELDS = {
  liveAgentEnabled: "",
  liveAgentCode: "",
  liveAgentResilience: "",
  liveAgentNotifyEmail: "",
} as const;

type FlatApiKey = {
  _id: Types.ObjectId;
  liveAgentEnabled?: boolean;
  liveAgentCode?: unknown;
  liveAgentResilience?: unknown;
  liveAgentNotifyEmail?: unknown;
};

type LegacyLeadSettings = {
  apiKeyId?: Types.ObjectId;
  enabled?: unknown;
  strategy?: unknown;
  fields?: unknown;
};

function isLeadField(value: unknown): value is LeadFieldConfig {
  if (!value || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  return (
    typeof field.id === "string" &&
    typeof field.key === "string" &&
    typeof field.label === "string" &&
    typeof field.type === "string" &&
    FIELD_TYPES.has(field.type) &&
    typeof field.required === "boolean" &&
    typeof field.order === "number"
  );
}

function resilienceOf(value: unknown): "low" | "medium" | "high" | "never" {
  return typeof value === "string" && RESILIENCE.has(value)
    ? (value as "low" | "medium" | "high" | "never")
    : "medium";
}

function strategyOf(value: unknown): LeadCaptureStrategy {
  return typeof value === "string" && STRATEGIES.has(value)
    ? (value as LeadCaptureStrategy)
    : "subtle";
}

/** Copy flat live-agent fields and the old lead-capture settings collection onto API keys. */
export async function migrateNestedApiKeySettings(): Promise<void> {
  const keys = ApiKeyModel.collection;
  const flatKeys = (await keys
    .find({
      liveAgentSetting: { $exists: false },
      $or: [
        { liveAgentEnabled: { $exists: true } },
        { liveAgentCode: { $exists: true } },
        { liveAgentResilience: { $exists: true } },
        { liveAgentNotifyEmail: { $exists: true } },
      ],
    })
    .toArray()) as FlatApiKey[];

  let liveAgentCount = 0;
  for (const doc of flatKeys) {
    const code =
      typeof doc.liveAgentCode === "string" ? doc.liveAgentCode.trim().toUpperCase() : "";
    const notifyEmail =
      typeof doc.liveAgentNotifyEmail === "string"
        ? doc.liveAgentNotifyEmail.trim().toLowerCase()
        : "";
    const setting: {
      enabled: boolean;
      resilience: "low" | "medium" | "high" | "never";
      notifyEmail: string;
      code?: string;
    } = {
      enabled: doc.liveAgentEnabled === true,
      resilience: resilienceOf(doc.liveAgentResilience),
      notifyEmail,
    };
    if (code) setting.code = code;

    const result = await keys.updateOne(
      { _id: doc._id, liveAgentSetting: { $exists: false } },
      {
        $set: { liveAgentSetting: setting },
        $unset: FLAT_LIVE_AGENT_FIELDS,
      },
    );
    if (result.modifiedCount > 0) liveAgentCount += 1;
  }

  await keys.updateMany(
    {
      $or: [
        { liveAgentEnabled: { $exists: true } },
        { liveAgentCode: { $exists: true } },
        { liveAgentResilience: { $exists: true } },
        { liveAgentNotifyEmail: { $exists: true } },
      ],
    },
    { $unset: FLAT_LIVE_AGENT_FIELDS },
  );

  let leadCaptureCount = 0;
  const listed = await ApiKeyModel.db.listCollections();
  if (listed.some((entry) => entry.name === "leadcapturesettings")) {
    const settings = ApiKeyModel.db.collection("leadcapturesettings");
    const docs = (await settings.find({}).toArray()) as LegacyLeadSettings[];
    for (const doc of docs) {
      if (!doc.apiKeyId) continue;
      const fields = Array.isArray(doc.fields) ? doc.fields.filter(isLeadField) : [];
      const result = await keys.updateOne(
        { _id: doc.apiKeyId, leadCaptureSetting: { $exists: false } },
        {
          $set: {
            leadCaptureSetting: {
              enabled: doc.enabled === true,
              strategy: strategyOf(doc.strategy),
              fields,
            },
          },
        },
      );
      if (result.modifiedCount > 0) leadCaptureCount += 1;
    }
    await settings.drop();
  }

  try {
    await keys.dropIndex("liveAgentCode_1");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code: unknown }).code
        : undefined;
    if (code !== 27) throw error;
  }

  if (liveAgentCount > 0 || leadCaptureCount > 0) {
    logger.info(
      `Nested settings onto API keys (${liveAgentCount} live agent, ${leadCaptureCount} lead capture)`,
      "apiKey",
      "migrateNestedApiKeySettings",
    );
  }
}

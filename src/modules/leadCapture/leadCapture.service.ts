import { Types } from "mongoose";
import type {
  ApplyLeadAgentActionDto,
  LeadAgentActionResultDto,
  LeadCaptureSettingsOutDto,
  LeadExportOutDto,
  LeadMessageOutDto,
  LeadOutDto,
  UpdateLeadCaptureSettingsDto,
} from "../../dto/leadCapture.dto";
import { ollamaClient, OLLAMA_CHAT_MODEL } from "../../llm/ollama/ollamaClient";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import { ChatMessageModel } from "../../models/message/message.model";
import {
  defaultLeadCaptureFields,
  type LeadCaptureSettingsInterface,
  type LeadFieldConfig,
  type LeadInterface,
  type LeadQualification,
  type LeadStatus,
} from "../../models/leadCapture/leadCapture.interface";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { LEAD_TTL_SECONDS, LeadModel } from "../../models/leadCapture/lead.model";
import { entitlementService } from "../entitlement/entitlement.service";
import {
  LEAD_SUMMARY_MAX,
  decideLeadWrite,
  valuesToMap,
} from "./leadCapture.policy";
import { kickLeadSummaryWorker } from "./leadSummary.worker";

const SUBMITTED_STATUSES: LeadStatus[] = ["lead", "qualified", "hot"];
/** New submitted leads per project. Updates to an existing chat do not count. */
const LEAD_HOURLY_CREATE_CAP = 20;
const SUMMARY_MESSAGE_CAP = 40;
const MESSAGE_READ_CAP = 200;

type LeadDoc = LeadInterface & { _id: Types.ObjectId };

function toSettingsOut(
  apiKeyId: Types.ObjectId,
  settings: LeadCaptureSettingsInterface,
): LeadCaptureSettingsOutDto {
  return {
    apiKeyId: apiKeyId.toString(),
    enabled: settings.enabled,
    strategy: settings.strategy,
    fields: [...settings.fields].sort((a, b) => a.order - b.order),
  };
}

function toLeadOut(doc: LeadDoc): LeadOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    chatSessionId: doc.chatSessionId.toString(),
    status: doc.status,
    fieldValues: doc.fieldValues,
    summary: doc.summary ?? "",
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    expiresAt: new Date(
      doc.createdAt.getTime() + LEAD_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}

function isQualification(value: string | undefined): value is LeadQualification {
  return value === "lead" || value === "qualified" || value === "hot";
}

export type LeadCaptureAgentContext = {
  strategy: LeadCaptureSettingsInterface["strategy"];
  fields: LeadCaptureSettingsInterface["fields"];
  gathered: Record<string, string>;
  missingRequired: string[];
};

class LeadCaptureService {
  async getSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<LeadCaptureSettingsOutDto> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    const settings = await this.ensureSettings(apiKeyId);
    return toSettingsOut(apiKeyId, settings);
  }

  async updateSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    patch: UpdateLeadCaptureSettingsDto,
  ): Promise<LeadCaptureSettingsOutDto> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    const settings = await this.ensureSettings(apiKeyId);
    if (patch.enabled !== undefined) settings.enabled = patch.enabled;
    if (patch.strategy !== undefined) settings.strategy = patch.strategy;
    if (patch.fields !== undefined) settings.fields = patch.fields;
    await ApiKeyModel.updateOne(
      { _id: apiKeyId },
      { $set: { leadCaptureSetting: settings } },
    );
    return toSettingsOut(apiKeyId, settings);
  }

  async listLeads(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<LeadOutDto[]> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    // ponytail: latest 100, paginate if a project outgrows the settings page
    const leads = await LeadModel.find({
      apiKeyId,
      status: { $in: SUBMITTED_STATUSES },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean<LeadDoc[]>();
    return leads.map(toLeadOut);
  }

  /**
   * Agent turn context. Returns null when the plan or project toggle is off
   * so the rest of the turn is unchanged. Does not throw for a missing capability.
   */
  async agentContext(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionId: string,
  ): Promise<LeadCaptureAgentContext | null> {
    const allowed = await entitlementService.hasLeadCapture(userId, apiKeyId);
    if (!allowed) return null;

    const key = await ApiKeyModel.findById(apiKeyId).lean<{
      leadCaptureSetting?: LeadCaptureSettingsInterface;
    } | null>();
    const settings = key?.leadCaptureSetting;
    if (!settings?.enabled) return null;

    let gathered: Record<string, string> = {};
    if (Types.ObjectId.isValid(sessionId)) {
      const lead = await LeadModel.findOne({
        apiKeyId,
        chatSessionId: new Types.ObjectId(sessionId),
      }).lean<LeadDoc | null>();
      if (lead) gathered = valuesToMap(lead.fieldValues);
    }

    const missingRequired = settings.fields
      .filter((field) => field.required && !gathered[field.key]?.trim())
      .map((field) => field.key);

    return {
      strategy: settings.strategy,
      fields: settings.fields,
      gathered,
      missingRequired,
    };
  }

  async applyAgentAction(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    input: ApplyLeadAgentActionDto,
  ): Promise<LeadAgentActionResultDto> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);

    const key = await ApiKeyModel.findById(apiKeyId).lean<{
      leadCaptureSetting?: LeadCaptureSettingsInterface;
    } | null>();
    const settings = key?.leadCaptureSetting;
    if (!settings?.enabled) {
      throw new Error("Lead Capture is not enabled for this project");
    }

    if (input.action === "submit" && !isQualification(input.qualification)) {
      throw new Error("qualification must be lead, qualified, or hot");
    }

    if (!Types.ObjectId.isValid(input.sessionId)) {
      throw new Error("Chat session not found");
    }
    const chatSessionId = new Types.ObjectId(input.sessionId);
    const session = await ChatSessionModel.findOne({
      _id: chatSessionId,
      apiKeyId,
    }).lean<{ userId: Types.ObjectId } | null>();
    if (!session) {
      throw new Error("Chat session not found");
    }

    const existing = await LeadModel.findOne({
      apiKeyId,
      chatSessionId,
    }).lean<LeadDoc | null>();

    const decision = decideLeadWrite({
      action: input.action,
      strategy: settings.strategy,
      qualification: input.qualification ?? null,
      fields: settings.fields,
      existingValues: existing ? valuesToMap(existing.fieldValues) : {},
      existingStatus: existing?.status ?? null,
      existingSummary: existing?.summary ?? "",
      incoming: input.fields,
      summary: input.summary,
    });

    const alreadySubmitted = isSubmittedStatus(existing?.status ?? null);
    if (!existing && decision.fieldValues.length === 0) {
      return {
        submitted: false,
        status: "gathering",
        missingRequired: decision.missingRequired,
        ask: decision.ask,
        gathered: decision.values,
        alreadyCaptured: false,
        instruction: "No customer fields were provided.",
      };
    }

    const email = normalizedEmail(settings.fields, decision.values);
    if (email && !alreadySubmitted) {
      const duplicate = await LeadModel.findOne({
        apiKeyId,
        chatSessionId: { $ne: chatSessionId },
        status: { $in: SUBMITTED_STATUSES },
        fieldValues: {
          $elemMatch: {
            key: { $in: emailKeys(settings.fields) },
            value: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
          },
        },
      }).lean<LeadDoc | null>();
      if (duplicate) {
        return {
          submitted: false,
          status: existing?.status ?? "gathering",
          missingRequired: [],
          ask: decision.ask,
          gathered: decision.values,
          alreadyCaptured: true,
          instruction:
            "These details are already saved for this project. Do not ask again and do not submit another lead.",
        };
      }
    }

    const newlySubmitted = decision.submitted && !alreadySubmitted;
    if (newlySubmitted) {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const createdThisHour = await LeadModel.countDocuments({
        apiKeyId,
        status: { $in: SUBMITTED_STATUSES },
        createdAt: { $gte: since },
      });
      if (createdThisHour >= LEAD_HOURLY_CREATE_CAP) {
        throw new Error("Lead capture limit reached for this hour");
      }
    }

    await LeadModel.findOneAndUpdate(
      { apiKeyId, chatSessionId },
      {
        $set: {
          userId: session.userId,
          status: decision.status,
          fieldValues: decision.fieldValues,
          summary: decision.summary,
          ...(newlySubmitted
            ? {
                summaryJobStatus: "pending" as const,
                summaryJobAttempts: 0,
                summaryJobClaimedAt: null,
                summaryJobNextAt: new Date(),
                summaryJobLastError: "",
              }
            : {}),
        },
        $setOnInsert: {
          apiKeyId,
          chatSessionId,
        },
      },
      { upsert: true, new: true },
    );

    if (newlySubmitted) {
      kickLeadSummaryWorker();
    }

    return {
      submitted: decision.submitted,
      status: decision.status,
      missingRequired: decision.missingRequired,
      ask: decision.ask,
      gathered: decision.values,
      alreadyCaptured: false,
      instruction: decision.instruction,
    };
  }

  async deleteLead(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    leadId: Types.ObjectId,
  ): Promise<void> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    const deleted = await LeadModel.findOneAndDelete({
      _id: leadId,
      apiKeyId,
    }).lean<LeadDoc | null>();
    if (!deleted) throw new Error("Lead not found");
  }

  async listMessages(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    leadId: Types.ObjectId,
  ): Promise<LeadMessageOutDto[]> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    const lead = await LeadModel.findOne({
      _id: leadId,
      apiKeyId,
    }).lean<LeadDoc | null>();
    if (!lead) throw new Error("Lead not found");

    const docs = await ChatMessageModel.find({
      sessionId: lead.chatSessionId,
      role: { $in: ["user", "assistant"] },
    })
      .sort({ createdAt: 1 })
      .limit(MESSAGE_READ_CAP)
      .lean<ChatMessageDoc[]>();

    return docs
      .map((doc) => ({
        role: doc.role,
        text: textFromMessage(doc),
        createdAt: doc.createdAt.toISOString(),
      }))
      .filter((message) => message.text.length > 0);
  }

  async exportCsv(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<LeadExportOutDto> {
    await entitlementService.assertLeadCaptureEntitled(userId, apiKeyId);
    const leads = await LeadModel.find({
      apiKeyId,
      status: { $in: SUBMITTED_STATUSES },
    })
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean<LeadDoc[]>();
    return { csv: leadsToCsv(leads) };
  }

  /**
   * Ollama-only summary text for the lead summary worker.
   * Throws on failure so the worker can retry / mark failed.
   * Returns "" when there is nothing useful to summarize (treated as done).
   */
  async generateLeadSummaryText(leadId: Types.ObjectId): Promise<string> {
    const lead = await LeadModel.findById(leadId).lean<LeadDoc | null>();
    if (!lead) {
      throw new Error("Lead not found");
    }
    const docs = await ChatMessageModel.find({
      sessionId: lead.chatSessionId,
      role: { $in: ["user", "assistant"] },
    })
      .sort({ createdAt: 1 })
      .limit(SUMMARY_MESSAGE_CAP)
      .lean<ChatMessageDoc[]>();
    const transcript = docs
      .map((doc) => `${doc.role}: ${textFromMessage(doc)}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n")
      .slice(0, 8000);
    if (!transcript.trim()) return "";

    const result = await ollamaClient.chatTurn(
      [
        {
          role: "system",
          content:
            "Summarize this customer chat in 2-4 sentences for a sales lead. Plain text only.",
        },
        { role: "user", content: transcript },
      ],
      { provider: "ollama", name: OLLAMA_CHAT_MODEL, temperature: 0.2 },
    );
    return result.text.trim().slice(0, LEAD_SUMMARY_MAX);
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await LeadModel.deleteMany({ apiKeyId });
  }

  private async ensureSettings(
    apiKeyId: Types.ObjectId,
  ): Promise<LeadCaptureSettingsInterface> {
    const existing = await ApiKeyModel.findById(apiKeyId).lean<{
      leadCaptureSetting?: LeadCaptureSettingsInterface;
    } | null>();
    if (!existing) {
      throw new Error("API key not found");
    }
    if (existing.leadCaptureSetting) return existing.leadCaptureSetting;

    const created: LeadCaptureSettingsInterface = {
      enabled: false,
      strategy: "subtle",
      fields: defaultLeadCaptureFields(),
    };
    const updated = await ApiKeyModel.findOneAndUpdate(
      { _id: apiKeyId, leadCaptureSetting: { $exists: false } },
      { $set: { leadCaptureSetting: created } },
      { new: true },
    ).lean<{ leadCaptureSetting?: LeadCaptureSettingsInterface } | null>();
    if (updated?.leadCaptureSetting) return updated.leadCaptureSetting;

    const refreshed = await ApiKeyModel.findById(apiKeyId).lean<{
      leadCaptureSetting?: LeadCaptureSettingsInterface;
    } | null>();
    if (!refreshed?.leadCaptureSetting) {
      throw new Error("API key not found");
    }
    return refreshed.leadCaptureSetting;
  }
}

export const leadCaptureService = new LeadCaptureService();

type ChatMessageDoc = {
  role: "user" | "assistant";
  content: Array<{ type: string; content?: string }>;
  createdAt: Date;
};

function isSubmittedStatus(status: LeadStatus | null): boolean {
  return status !== null && SUBMITTED_STATUSES.includes(status);
}

function emailKeys(fields: LeadFieldConfig[]): string[] {
  return fields.filter((field) => field.type === "email").map((field) => field.key);
}

function normalizedEmail(
  fields: LeadFieldConfig[],
  values: Record<string, string>,
): string | null {
  for (const key of emailKeys(fields)) {
    const value = values[key]?.trim().toLowerCase();
    if (value) return value;
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textFromMessage(doc: ChatMessageDoc): string {
  return doc.content
    .filter((block) => block.type === "text" && block.content)
    .map((block) => block.content ?? "")
    .join("\n")
    .trim();
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function leadsToCsv(leads: LeadDoc[]): string {
  const labels: string[] = [];
  for (const lead of leads) {
    for (const field of lead.fieldValues) {
      if (!labels.includes(field.label)) labels.push(field.label);
    }
  }
  const header = ["status", "createdAt", "summary", "chatSessionId", ...labels];
  const rows = leads.map((lead) => {
    const byLabel = new Map(
      lead.fieldValues.map((field) => [field.label, field.value]),
    );
    return [
      lead.status,
      lead.createdAt.toISOString(),
      lead.summary ?? "",
      lead.chatSessionId.toString(),
      ...labels.map((label) => byLabel.get(label) ?? ""),
    ].map(csvCell);
  });
  return [header.map(csvCell), ...rows].map((row) => row.join(",")).join("\n");
}

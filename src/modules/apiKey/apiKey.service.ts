import * as bcrypt from "bcrypt";
import crypto from "crypto";
import { Types } from "mongoose";
import type {
  ApiKeyOutDto,
  CreateApiKeyDto,
  CreateApiKeyOutDto,
  UpdateApiKeyDto,
} from "../../dto/apiKey.dto";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import type { ApiKeyInterface } from "../../models/apiKey/apiKey.interface";
import { loadApiKeyAccess } from "../../middleware/requireApiKeyAccess";
import { ApiKeyCollaboratorModel } from "../../models/apiKeyCollaborator/apiKeyCollaborator.model";
import { entitlementService } from "../entitlement/entitlement.service";
import { agentService } from "../agent/agent.service";
import { articleService } from "../article/article.service";
import { apiKeyCollaborationInviteService } from "../apiKeyCollaborationInvite/apiKeyCollaborationInvite.service";
import { apiKeyCollaboratorService } from "../apiKeyCollaborator/apiKeyCollaborator.service";
import { batchTestService } from "../batchTest/batchTest.service";
import { chatAnalyticsService } from "../chatAnalytics/chatAnalytics.service";
import { guidanceService } from "../guidance/guidance.service";
import { leadCaptureService } from "../leadCapture/leadCapture.service";
import { liveAgentService } from "../liveAgent/liveAgent.service";
import { liveAgentTicketService } from "../liveAgent/ticket.service";
import { mcpService } from "../mcp/mcp.service";
import { meetingService } from "../meetingTool/meeting.service";
import { meetingToolService } from "../meetingTool/meetingTool.service";
import { snippetService } from "../snippet/snippet.service";
import { newsService } from "../widget/news.service";
import { widgetService } from "../widget/widget.service";
import { widgetAnalyticsService } from "../widgetAnalytics/widgetAnalytics.service";

type ApiKeyDoc = ApiKeyInterface & { _id: Types.ObjectId };

function toApiKeyOutDto(
  doc: ApiKeyDoc,
  role: "owner" | "collaborator",
): ApiKeyOutDto {
  return {
    id: doc._id.toString(),
    label: doc.label,
    description: doc.description ?? "",
    prefix: doc.prefix,
    ipAllowlist: doc.ipAllowlist,
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    status: doc.status.status,
    enhancedRetrieval: doc.enhancedRetrieval === true,
    role,
  };
}

async function findOwnedKey(
  userId: Types.ObjectId,
  keyId: string,
): Promise<ApiKeyDoc | null> {
  return ApiKeyModel.findOne({
    _id: new Types.ObjectId(keyId),
    userId,
  }).lean<ApiKeyDoc>();
}

/** Hard-delete all tenant data for an API key before soft-revoke. */
async function cascadeDeleteForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
  // Children that other modules may still reference.
  await Promise.all([
    agentService.deleteAllForApiKey(apiKeyId),
    liveAgentTicketService.deleteAllForApiKey(apiKeyId),
    meetingService.deleteAllForApiKey(apiKeyId),
  ]);

  // Knowledge: snippets before article (article wipes shared GridFS).
  await snippetService.deleteAllForApiKey(apiKeyId);
  await articleService.deleteAllForApiKey(apiKeyId);

  // Remaining tenant surface (independent).
  await Promise.all([
    liveAgentService.deleteAllForApiKey(apiKeyId),
    leadCaptureService.deleteAllForApiKey(apiKeyId),
    meetingToolService.deleteAllForApiKey(apiKeyId),
    guidanceService.deleteAllForApiKey(apiKeyId),
    mcpService.deleteAllForApiKey(apiKeyId),
    newsService.deleteAllForApiKey(apiKeyId),
    widgetService.deleteAllForApiKey(apiKeyId),
    chatAnalyticsService.deleteAllForApiKey(apiKeyId),
    widgetAnalyticsService.deleteAllForApiKey(apiKeyId),
    batchTestService.deleteAllForApiKey(apiKeyId),
    apiKeyCollaborationInviteService.deleteAllForApiKey(apiKeyId),
    apiKeyCollaboratorService.deleteAllForApiKey(apiKeyId),
  ]);
}

export class ApiKeyService {
  async listForUser(userId: Types.ObjectId): Promise<ApiKeyOutDto[]> {
    const owned = await ApiKeyModel.find({
      userId,
      "status.status": { $ne: "revoked" },
    })
      .sort({ label: 1 })
      .lean<ApiKeyDoc[]>();

    const collabRows = await ApiKeyCollaboratorModel.find({ userId })
      .select("apiKeyId")
      .lean<Array<{ apiKeyId: Types.ObjectId }>>();
    const collabIds = collabRows.map((row) => row.apiKeyId);
    const shared =
      collabIds.length === 0
        ? []
        : await ApiKeyModel.find({
            _id: { $in: collabIds },
            "status.status": { $ne: "revoked" },
          })
            .sort({ label: 1 })
            .lean<ApiKeyDoc[]>();

    return [
      ...owned.map((doc) => toApiKeyOutDto(doc, "owner")),
      ...shared.map((doc) => toApiKeyOutDto(doc, "collaborator")),
    ];
  }

  async createForUser(
    userId: Types.ObjectId,
    input: CreateApiKeyDto,
  ): Promise<CreateApiKeyOutDto> {
    const allowed = await entitlementService.canCreateApiKey(userId);
    if (!allowed) {
      throw new Error("API key limit reached for your plan");
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const prefix = `sapai_sk_${secret.slice(0, 8)}`;
    const fullKey = `${prefix}.${secret}`;
    const hashedKey = await bcrypt.hash(fullKey, 10);

    const doc = await ApiKeyModel.create({
      userId,
      label: input.label,
      description: input.description ?? "",
      prefix,
      hashedKey,
      ipAllowlist: input.ipAllowlist ?? [],
      lastUsedAt: null,
      status: {
        status: "active",
        appliedAt: new Date(),
      },
    });

    const out = toApiKeyOutDto(doc.toObject() as ApiKeyDoc, "owner");
    return { ...out, key: fullKey };
  }

  async updateForUser(
    userId: Types.ObjectId,
    keyId: string,
    patch: UpdateApiKeyDto,
  ): Promise<ApiKeyOutDto> {
    const existing = await findOwnedKey(userId, keyId);
    if (!existing) {
      throw new Error("API key not found");
    }
    if (existing.status.status === "revoked") {
      throw new Error("Cannot update a revoked API key");
    }

    const updated = await ApiKeyModel.findByIdAndUpdate(
      existing._id,
      { $set: patch },
      { new: true },
    ).lean<ApiKeyDoc>();

    if (!updated) {
      throw new Error("Failed to update API key");
    }

    return toApiKeyOutDto(updated, "owner");
  }

  async revokeForUser(
    userId: Types.ObjectId,
    keyId: string,
  ): Promise<ApiKeyOutDto> {
    const existing = await findOwnedKey(userId, keyId);
    if (!existing) {
      throw new Error("API key not found");
    }
    if (existing.status.status === "revoked") {
      throw new Error("API key is already revoked");
    }

    await cascadeDeleteForApiKey(existing._id);

    const updated = await ApiKeyModel.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          status: {
            status: "revoked",
            appliedAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean<ApiKeyDoc>();

    if (!updated) {
      throw new Error("Failed to revoke API key");
    }

    return toApiKeyOutDto(updated, "owner");
  }

  async getDetailsForUser(
    userId: Types.ObjectId,
    keyId: string,
  ): Promise<ApiKeyOutDto> {
    const access = await loadApiKeyAccess(userId, new Types.ObjectId(keyId));
    const existing = await ApiKeyModel.findById(access.apiKey.id).lean<ApiKeyDoc>();
    if (!existing) {
      throw new Error("API key not found");
    }
    return { ...toApiKeyOutDto(existing, access.role), permissions: access.permissions };
  }


  async rotateKey(
    userId: Types.ObjectId,
    keyId: string,
  ): Promise<CreateApiKeyOutDto> {
    const existing = await findOwnedKey(userId, keyId);
    if (!existing) {
      throw new Error("API key not found");
    }
    if (existing.status.status === "revoked") {
      throw new Error("Cannot rotate a revoked API key");
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const prefix = `sapai_sk_${secret.slice(0, 8)}`;
    const fullKey = `${prefix}.${secret}`;
    const hashedKey = await bcrypt.hash(fullKey, 10);

    const updated = await ApiKeyModel.findByIdAndUpdate(
      existing._id,
      { $set: { prefix, hashedKey } },
      { new: true },
    ).lean<ApiKeyDoc>();

    if (!updated) {
      throw new Error("Failed to rotate API key");
    }

    return { ...toApiKeyOutDto(updated, "owner"), key: fullKey };
  }
}

export const apiKeyService = new ApiKeyService();

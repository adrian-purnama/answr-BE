import { createHash, randomBytes } from "crypto";
import { Types } from "mongoose";
import type {
  AcceptApiKeyCollaborationInviteOutDto,
  CreateApiKeyCollaborationInviteOutDto,
} from "../../dto/apiKeyCollaborationInvite.dto";
import { env } from "../../environment/env";
import type { ApiKeyCollaborationInviteInterface } from "../../models/apiKeyCollaborationInvite/apiKeyCollaborationInvite.interface";
import { ApiKeyCollaborationInviteModel } from "../../models/apiKeyCollaborationInvite/apiKeyCollaborationInvite.model";
import type { ApiKeyCollaboratorInterface } from "../../models/apiKeyCollaborator/apiKeyCollaborator.interface";
import { defaultCollaboratorPermissions } from "../../models/apiKeyCollaborator/apiKeyCollaborator.interface";
import { ApiKeyCollaboratorModel } from "../../models/apiKeyCollaborator/apiKeyCollaborator.model";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";

export const COLLABORATION_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InviteDoc = ApiKeyCollaborationInviteInterface & { _id: Types.ObjectId };
type CollaboratorDoc = ApiKeyCollaboratorInterface & { _id: Types.ObjectId };
type ApiKeySummary = { userId: Types.ObjectId; label: string };

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function buildCollaborationInviteUrl(
  frontendUrl: string,
  apiKeyId: string,
  rawToken: string,
): string {
  const base = frontendUrl.replace(/\/$/, "");
  return `${base}/api-key/${apiKeyId}/collaborate/${rawToken}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

function toCreateOutDto(
  doc: InviteDoc,
  invitationUrl: string,
): CreateApiKeyCollaborationInviteOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    createdBy: doc.createdBy.toString(),
    expiresAt: doc.expiresAt.toISOString(),
    usedAt: doc.usedAt ? doc.usedAt.toISOString() : null,
    invitationUrl,
  };
}

function ownerAcceptDto(apiKeyId: Types.ObjectId, label: string): AcceptApiKeyCollaborationInviteOutDto {
  return {
    apiKeyId: apiKeyId.toString(),
    label,
    role: "owner",
    alreadyMember: true,
    permissions: null,
  };
}

function collaboratorAcceptDto(
  apiKeyId: Types.ObjectId,
  label: string,
  alreadyMember: boolean,
  permissions: CollaboratorDoc["permissions"],
): AcceptApiKeyCollaborationInviteOutDto {
  return {
    apiKeyId: apiKeyId.toString(),
    label,
    role: "collaborator",
    alreadyMember,
    permissions,
  };
}

async function findCollaborator(
  apiKeyId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<CollaboratorDoc | null> {
  return ApiKeyCollaboratorModel.findOne({ apiKeyId, userId }).lean<CollaboratorDoc>();
}

async function ensureCollaborator(
  apiKeyId: Types.ObjectId,
  userId: Types.ObjectId,
  label: string,
): Promise<AcceptApiKeyCollaborationInviteOutDto> {
  const existing = await findCollaborator(apiKeyId, userId);
  if (existing) {
    return collaboratorAcceptDto(apiKeyId, label, true, existing.permissions);
  }

  try {
    const doc = await ApiKeyCollaboratorModel.create({
      apiKeyId,
      userId,
      permissions: defaultCollaboratorPermissions(),
    });
    const created = doc.toObject() as CollaboratorDoc;
    return collaboratorAcceptDto(apiKeyId, label, false, created.permissions);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const duplicate = await findCollaborator(apiKeyId, userId);
    if (!duplicate) throw error;
    return collaboratorAcceptDto(apiKeyId, label, true, duplicate.permissions);
  }
}

async function claimInvite(
  inviteId: Types.ObjectId,
  userId: Types.ObjectId,
  now: Date,
): Promise<InviteDoc | null> {
  return ApiKeyCollaborationInviteModel.findOneAndUpdate(
    {
      _id: inviteId,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now, usedBy: userId } },
    { new: true },
  ).lean<InviteDoc>();
}

export class ApiKeyCollaborationInviteService {
  async createForOwner(
    ownerUserId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<CreateApiKeyCollaborationInviteOutDto> {
    const apiKey = await ApiKeyModel.findById(apiKeyId).select("userId").lean();
    if (!apiKey) {
      throw new Error("API key not found");
    }
    if (!apiKey.userId.equals(ownerUserId)) {
      throw new Error("Only the API key owner can create invitations");
    }

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + COLLABORATION_INVITE_TTL_MS);

    const doc = await ApiKeyCollaborationInviteModel.create({
      apiKeyId,
      createdBy: ownerUserId,
      tokenHash,
      expiresAt,
      usedAt: null,
      usedBy: null,
    });

    const invitationUrl = buildCollaborationInviteUrl(
      env.frontendUrl,
      apiKeyId.toString(),
      rawToken,
    );

    return toCreateOutDto(doc.toObject() as InviteDoc, invitationUrl);
  }

  async acceptForUser(
    userId: Types.ObjectId,
    rawToken: string,
  ): Promise<AcceptApiKeyCollaborationInviteOutDto> {
    const tokenHash = hashInviteToken(rawToken);
    const invite = await ApiKeyCollaborationInviteModel.findOne({
      tokenHash,
    }).lean<InviteDoc>();
    if (!invite) {
      throw new Error("Invalid invitation");
    }

    const apiKey = await ApiKeyModel.findById(invite.apiKeyId)
      .select("userId label")
      .lean<ApiKeySummary | null>();
    if (!apiKey) {
      throw new Error("API key not found");
    }

    if (apiKey.userId.equals(userId)) {
      return ownerAcceptDto(invite.apiKeyId, apiKey.label);
    }

    const now = new Date();
    if (!invite.usedAt && invite.expiresAt.getTime() <= now.getTime()) {
      throw new Error("This invitation has expired");
    }

    if (invite.usedAt) {
      if (invite.usedBy?.equals(userId)) {
        return ensureCollaborator(invite.apiKeyId, userId, apiKey.label);
      }
      throw new Error("This invitation has already been used");
    }

    const claimed = await claimInvite(invite._id, userId, now);
    if (!claimed) {
      const latest = await ApiKeyCollaborationInviteModel.findOne({
        tokenHash,
      }).lean<InviteDoc>();
      if (!latest) {
        throw new Error("Invalid invitation");
      }
      if (latest.usedBy?.equals(userId)) {
        return ensureCollaborator(latest.apiKeyId, userId, apiKey.label);
      }
      if (latest.usedAt) {
        throw new Error("This invitation has already been used");
      }
      if (latest.expiresAt.getTime() <= Date.now()) {
        throw new Error("This invitation has expired");
      }
      throw new Error("Invalid invitation");
    }

    return ensureCollaborator(invite.apiKeyId, userId, apiKey.label);
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await ApiKeyCollaborationInviteModel.deleteMany({ apiKeyId });
  }
}

export const apiKeyCollaborationInviteService =
  new ApiKeyCollaborationInviteService();

import type { Response } from "express";
import * as bcrypt from "bcrypt";
import crypto from "crypto";
import { Types } from "mongoose";
import type {
  CreateLiveAgentDto,
  LiveAgentLoginDto,
  LiveAgentLoginOutDto,
  LiveAgentMeOutDto,
  LiveAgentMediaOutDto,
  LiveAgentOutDto,
  LiveAgentSettingsOutDto,
  ResetLiveAgentPasswordDto,
  UpdateLiveAgentDto,
  UpdateLiveAgentSettingsDto,
} from "../../dto/liveAgent.dto";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import type { ApiKeyInterface } from "../../models/apiKey/apiKey.interface";
import { LiveAgentModel } from "../../models/liveAgent/liveAgent.model";
import type { LiveAgentInterface } from "../../models/liveAgent/liveAgent.interface";
import {
  deleteAllLiveAgentFilesForApiKey,
  deleteLiveAgentFileIfExists,
  findOwnedLiveAgentFile,
  openLiveAgentDownload,
  uploadLiveAgentFile,
} from "../../buckets/liveAgentBucket";
import { signLiveAgentToken } from "../../utils/jwt";
import { entitlementService } from "../entitlement/entitlement.service";

export const MAX_LIVE_AGENT_MEDIA_BYTES = 5 * 1024 * 1024;
const BCRYPT_ROUNDS = 10;

type LiveAgentDoc = LiveAgentInterface & { _id: Types.ObjectId };
type ApiKeyDoc = ApiKeyInterface & { _id: Types.ObjectId };

function toLiveAgentOutDto(doc: LiveAgentDoc): LiveAgentOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    name: doc.name,
    enabled: doc.enabled,
    profilePicture: doc.profilePicture ?? "",
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function contentTypeOf(file: {
  metadata?: Record<string, unknown> | null;
}): string {
  const fromMeta =
    typeof file.metadata?.contentType === "string"
      ? file.metadata.contentType
      : undefined;
  return fromMeta ?? "application/octet-stream";
}

function generateLiveAgentCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

export class LiveAgentService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<LiveAgentOutDto[]> {
    const docs = await LiveAgentModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<LiveAgentDoc[]>();
    return docs.map(toLiveAgentOutDto);
  }

  async create(
    userId: Types.ObjectId,
    input: CreateLiveAgentDto,
  ): Promise<LiveAgentOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const allowed = await entitlementService.canCreateLiveAgent(
      userId,
      apiKeyId,
    );
    if (!allowed) {
      throw new Error("Live agent limit reached for your plan");
    }

    const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      const doc = await LiveAgentModel.create({
        userId,
        apiKeyId,
        name: input.name,
        enabled: input.enabled ?? true,
        profilePicture: "",
        hashedPassword,
      });

      return toLiveAgentOutDto(doc.toObject() as LiveAgentDoc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("A live agent with this name already exists");
      }
      throw error;
    }
  }

  async getById(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
  ): Promise<LiveAgentOutDto> {
    const doc = await this.findOwned(userId, apiKeyId, liveAgentId);
    return toLiveAgentOutDto(doc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
    patch: UpdateLiveAgentDto,
  ): Promise<LiveAgentOutDto> {
    const existing = await this.findOwned(userId, apiKeyId, liveAgentId);

    try {
      const updated = await LiveAgentModel.findByIdAndUpdate(
        existing._id,
        { $set: patch },
        { new: true },
      ).lean<LiveAgentDoc>();

      if (!updated) {
        throw new Error("Live agent not found");
      }
      return toLiveAgentOutDto(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("A live agent with this name already exists");
      }
      throw error;
    }
  }

  async resetPassword(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
    input: ResetLiveAgentPasswordDto,
  ): Promise<void> {
    const existing = await this.findOwned(userId, apiKeyId, liveAgentId);
    const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await LiveAgentModel.updateOne(
      { _id: existing._id },
      { $set: { hashedPassword } },
    );
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
  ): Promise<void> {
    const existing = await this.findOwned(userId, apiKeyId, liveAgentId);
    await LiveAgentModel.deleteOne({ _id: existing._id });
    if (existing.profilePicture) {
      await deleteLiveAgentFileIfExists(existing.profilePicture);
    }
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await LiveAgentModel.deleteMany({ apiKeyId });
    await deleteAllLiveAgentFilesForApiKey(apiKeyId);
  }

  async uploadAvatar(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
    file: Express.Multer.File,
  ): Promise<LiveAgentMediaOutDto> {
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Only images allowed");
    }
    if (file.size > MAX_LIVE_AGENT_MEDIA_BYTES) {
      throw new Error("Image must be 5MB or smaller");
    }

    const existing = await this.findOwned(userId, apiKeyId, liveAgentId);
    const previousId = existing.profilePicture ?? "";

    const uploaded = await uploadLiveAgentFile({
      buffer: file.buffer,
      filename: file.originalname || "avatar.bin",
      contentType: file.mimetype,
      metadata: { type: "avatar", userId, apiKeyId },
    });

    const mediaId = uploaded.id.toString();
    await LiveAgentModel.updateOne(
      { _id: existing._id },
      { $set: { profilePicture: mediaId } },
    );

    if (previousId && previousId !== mediaId) {
      await deleteLiveAgentFileIfExists(previousId);
    }

    return {
      mediaId,
      url: `/live-agents/media/${mediaId}?apiKeyId=${apiKeyId.toString()}`,
    };
  }

  async streamOwnedMedia(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mediaId: string,
    res: Response,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Media not found");
    }

    const file = await findOwnedLiveAgentFile(mediaId, userId, apiKeyId);
    if (!file) {
      throw new Error("Media not found");
    }

    res.setHeader("Content-Type", contentTypeOf(file));
    res.setHeader("Cache-Control", "private, max-age=3600");
    openLiveAgentDownload(mediaId).pipe(res);
  }

  private toSettingsOut(key: ApiKeyDoc): LiveAgentSettingsOutDto {
    const setting = key.liveAgentSetting;
    return {
      enabled: setting?.enabled ?? false,
      code: (setting?.code ?? "").trim().toUpperCase(),
      resilience: setting?.resilience ?? "medium",
      notifyEmail: (setting?.notifyEmail ?? "").trim().toLowerCase(),
    };
  }

  async getSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<LiveAgentSettingsOutDto> {
    await entitlementService.assertLiveAgentEntitled(userId, apiKeyId);
    const key = await this.findOwnedApiKey(userId, apiKeyId);
    const existingCode = key.liveAgentSetting?.code?.trim().toUpperCase() ?? "";
    if (existingCode) {
      return this.toSettingsOut({
        ...key,
        liveAgentSetting: { ...key.liveAgentSetting, code: existingCode },
      });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateLiveAgentCode();
      try {
        const updated = await ApiKeyModel.findOneAndUpdate(
          {
            _id: key._id,
            $or: [
              { "liveAgentSetting.code": { $exists: false } },
              { "liveAgentSetting.code": null },
              { "liveAgentSetting.code": "" },
            ],
          },
          { $set: { "liveAgentSetting.code": candidate } },
          { new: true },
        ).lean<ApiKeyDoc>();

        if (updated?.liveAgentSetting?.code) {
          return this.toSettingsOut(updated);
        }

        const refreshed = await ApiKeyModel.findById(key._id).lean<ApiKeyDoc>();
        if (refreshed?.liveAgentSetting?.code) {
          return this.toSettingsOut(refreshed);
        }
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    throw new Error("Failed to generate live agent code");
  }

  async updateSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    patch: UpdateLiveAgentSettingsDto,
  ): Promise<LiveAgentSettingsOutDto> {
    await entitlementService.assertLiveAgentEntitled(userId, apiKeyId);
    const key = await this.findOwnedApiKey(userId, apiKeyId);

    const setFields: {
      "liveAgentSetting.enabled"?: boolean;
      "liveAgentSetting.resilience"?: UpdateLiveAgentSettingsDto["resilience"];
      "liveAgentSetting.notifyEmail"?: string;
      "liveAgentSetting.code"?: string;
    } = {};
    if (typeof patch.enabled === "boolean") {
      setFields["liveAgentSetting.enabled"] = patch.enabled;
    }
    if (patch.resilience) {
      setFields["liveAgentSetting.resilience"] = patch.resilience;
    }
    if (typeof patch.notifyEmail === "string") {
      setFields["liveAgentSetting.notifyEmail"] = patch.notifyEmail;
    }

    if (!key.liveAgentSetting?.code) {
      setFields["liveAgentSetting.code"] = generateLiveAgentCode();
    }

    let updated: ApiKeyDoc | null = null;
    try {
      updated = await ApiKeyModel.findOneAndUpdate(
        { _id: key._id },
        { $set: setFields },
        { new: true },
      ).lean<ApiKeyDoc>();
    } catch (error) {
      if (isDuplicateKeyError(error) && setFields["liveAgentSetting.code"]) {
        setFields["liveAgentSetting.code"] = generateLiveAgentCode();
        updated = await ApiKeyModel.findOneAndUpdate(
          { _id: key._id },
          { $set: setFields },
          { new: true },
        ).lean<ApiKeyDoc>();
      } else {
        throw error;
      }
    }

    if (!updated) {
      throw new Error("API key not found");
    }

    if (!updated.liveAgentSetting?.code) {
      return this.getSettings(userId, apiKeyId);
    }

    return this.toSettingsOut(updated);
  }

  async login(input: LiveAgentLoginDto): Promise<LiveAgentLoginOutDto> {
    const code = input.code.trim().toUpperCase();
    const apiKey = await ApiKeyModel.findOne({
      "liveAgentSetting.code": code,
    }).lean<ApiKeyDoc>();

    if (!apiKey) {
      throw new Error("Invalid name, password, or code");
    }

    if (apiKey.status.status !== "active") {
      throw new Error("Project is not active");
    }

    if (!apiKey.liveAgentSetting?.enabled) {
      throw new Error("Live agent is disabled for this project");
    }

    const planAllows = await entitlementService.hasLiveAgent(
      apiKey.userId,
      apiKey._id,
    );
    if (!planAllows) {
      throw new Error("Your plan does not include Live Agent");
    }

    const agent = await LiveAgentModel.findOne({
      apiKeyId: apiKey._id,
      name: input.name.trim(),
    })
      .select("+hashedPassword")
      .lean<LiveAgentDoc & { hashedPassword: string }>();

    if (!agent || !agent.hashedPassword) {
      throw new Error("Invalid name, password, or code");
    }

    if (!agent.enabled) {
      throw new Error("Live agent is disabled");
    }

    const match = await bcrypt.compare(input.password, agent.hashedPassword);
    if (!match) {
      throw new Error("Invalid name, password, or code");
    }

    const jwt = signLiveAgentToken({
      agentId: agent._id.toString(),
      apiKeyId: agent.apiKeyId.toString(),
      name: agent.name,
      rememberMe: true,
    });

    return {
      name: agent.name,
      jwt,
    };
  }

  async me(agentId: Types.ObjectId): Promise<LiveAgentMeOutDto> {
    const doc = await LiveAgentModel.findById(agentId).lean<LiveAgentDoc>();
    if (!doc) {
      throw new Error("Live agent not found");
    }
    return {
      id: doc._id.toString(),
      apiKeyId: doc.apiKeyId.toString(),
      name: doc.name,
      enabled: doc.enabled,
      profilePicture: doc.profilePicture ?? "",
    };
  }

  private async findOwnedApiKey(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<ApiKeyDoc> {
    const key = await ApiKeyModel.findById(apiKeyId).lean<ApiKeyDoc>();
    if (!key) {
      throw new Error("API key not found");
    }
    if (key.status.status === "revoked") {
      throw new Error("API key is revoked");
    }
    return key;
  }

  private async findOwned(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    liveAgentId: string,
  ): Promise<LiveAgentDoc> {
    if (!Types.ObjectId.isValid(liveAgentId)) {
      throw new Error("Live agent not found");
    }
    const doc = await LiveAgentModel.findOne({
      _id: new Types.ObjectId(liveAgentId),
      apiKeyId,
    }).lean<LiveAgentDoc>();
    if (!doc) {
      throw new Error("Live agent not found");
    }
    return doc;
  }
}

export const liveAgentService = new LiveAgentService();

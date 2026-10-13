import { Types } from "mongoose";
import type {
  CreateGuidanceDto,
  GuidanceAgentItemDto,
  GuidanceOutDto,
  UpdateGuidanceDto,
} from "../../dto/guidance.dto";
import { GuidanceModel } from "../../models/guidance/guidance.model";
import type { GuidanceInterface } from "../../models/guidance/guidance.interface";
import { entitlementService } from "../entitlement/entitlement.service";
import {
  authorshipEmails,
  authorshipIds,
  userService,
} from "../user/user.service";

type GuidanceDoc = GuidanceInterface & { _id: Types.ObjectId };

function toGuidanceOutDto(
  doc: GuidanceDoc,
  emails: Map<string, string>,
): GuidanceOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    title: doc.title,
    content: doc.content,
    enabled: doc.enabled,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    ...authorshipEmails(doc, emails),
  };
}

async function guidanceOut(doc: GuidanceDoc): Promise<GuidanceOutDto> {
  const emails = await userService.emailsByIds(authorshipIds([doc]));
  return toGuidanceOutDto(doc, emails);
}

export class GuidanceService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<GuidanceOutDto[]> {
    const docs = await GuidanceModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<GuidanceDoc[]>();
    const emails = await userService.emailsByIds(authorshipIds(docs));
    return docs.map((doc) => toGuidanceOutDto(doc, emails));
  }

  async create(
    userId: Types.ObjectId,
    input: CreateGuidanceDto,
    actorId: Types.ObjectId = userId,
  ): Promise<GuidanceOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const allowed = await entitlementService.canCreateGuidance(
      userId,
      apiKeyId,
    );
    if (!allowed) {
      throw new Error("Guidance limit reached for your plan");
    }

    const content = input.content ?? "";
    const allowedChars = await entitlementService.canSetGuidanceCharacters(
      userId,
      apiKeyId,
      content.length,
    );
    if (!allowedChars) {
      throw new Error("Character limit reached for your plan");
    }

    const doc = await GuidanceModel.create({
      userId,
      apiKeyId,
      createdBy: actorId,
      updatedBy: actorId,
      title: input.title,
      content,
      enabled: true,
    });

    return guidanceOut(doc.toObject() as GuidanceDoc);
  }

  async getById(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    guidanceId: string,
  ): Promise<GuidanceOutDto> {
    const doc = await this.findOwned(userId, apiKeyId, guidanceId);
    return guidanceOut(doc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    guidanceId: string,
    patch: UpdateGuidanceDto,
    actorId: Types.ObjectId = userId,
  ): Promise<GuidanceOutDto> {
    const existing = await this.findOwned(userId, apiKeyId, guidanceId);

    if (patch.content !== undefined) {
      const allowedChars = await entitlementService.canSetGuidanceCharacters(
        userId,
        apiKeyId,
        patch.content.length,
      );
      if (!allowedChars) {
        throw new Error("Character limit reached for your plan");
      }
    }

    const updated = await GuidanceModel.findByIdAndUpdate(
      existing._id,
      { $set: { ...patch, updatedBy: actorId } },
      { new: true },
    ).lean<GuidanceDoc>();

    if (!updated) {
      throw new Error("Guidance not found");
    }
    return guidanceOut(updated);
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    guidanceId: string,
  ): Promise<void> {
    const existing = await this.findOwned(userId, apiKeyId, guidanceId);
    await GuidanceModel.deleteOne({ _id: existing._id });
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await GuidanceModel.deleteMany({ apiKeyId });
  }

  /** Enabled guidance for agent context (no ownership user check    caller scopes apiKey). */
  async listEnabledForAgent(
    apiKeyId: Types.ObjectId,
  ): Promise<GuidanceAgentItemDto[]> {
    const docs = await GuidanceModel.find({
      apiKeyId,
      enabled: true,
    })
      .sort({ updatedAt: 1 })
      .select("title content")
      .lean<Array<Pick<GuidanceDoc, "title" | "content"> & { _id: Types.ObjectId }>>();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      content: doc.content ?? "",
    }));
  }

  private async findOwned(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    guidanceId: string,
  ): Promise<GuidanceDoc> {
    if (!Types.ObjectId.isValid(guidanceId)) {
      throw new Error("Guidance not found");
    }
    const doc = await GuidanceModel.findOne({
      _id: new Types.ObjectId(guidanceId),
      apiKeyId,
    }).lean<GuidanceDoc>();
    if (!doc) {
      throw new Error("Guidance not found");
    }
    return doc;
  }
}

export const guidanceService = new GuidanceService();

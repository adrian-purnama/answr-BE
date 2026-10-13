import { Types } from "mongoose";
import type {
  ApiKeyCollaboratorOutDto,
  CreateApiKeyCollaboratorDto,
} from "../../dto/apiKeyCollaborator.dto";
import {
  defaultCollaboratorPermissions,
  type ApiKeyCollaboratorInterface,
  type CollaboratorPermissions,
} from "../../models/apiKeyCollaborator/apiKeyCollaborator.interface";
import { ApiKeyCollaboratorModel } from "../../models/apiKeyCollaborator/apiKeyCollaborator.model";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { UserModel } from "../../models/user/user.model";

type ApiKeyCollaboratorDoc = ApiKeyCollaboratorInterface & {
  _id: Types.ObjectId;
};

function toApiKeyCollaboratorOutDto(
  doc: ApiKeyCollaboratorDoc,
  email: string | null = null,
): ApiKeyCollaboratorOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    userId: doc.userId.toString(),
    email,
    permissions: {
      ...defaultCollaboratorPermissions(),
      ...doc.permissions,
      train: {
        ...defaultCollaboratorPermissions().train,
        ...doc.permissions.train,
      },
      tools: {
        ...defaultCollaboratorPermissions().tools,
        ...doc.permissions.tools,
      },
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

async function findDoc(
  apiKeyId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<ApiKeyCollaboratorDoc | null> {
  return ApiKeyCollaboratorModel.findOne({ apiKeyId, userId }).lean<ApiKeyCollaboratorDoc>();
}

export class ApiKeyCollaboratorService {
  async findByApiKeyAndUser(
    apiKeyId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<ApiKeyCollaboratorOutDto | null> {
    const doc = await findDoc(apiKeyId, userId);
    return doc ? toApiKeyCollaboratorOutDto(doc) : null;
  }

  async listByApiKey(
    apiKeyId: Types.ObjectId,
  ): Promise<ApiKeyCollaboratorOutDto[]> {
    const docs = await ApiKeyCollaboratorModel.find({ apiKeyId })
      .sort({ createdAt: 1 })
      .lean<ApiKeyCollaboratorDoc[]>();
    const users = await UserModel.find({
      _id: { $in: docs.map((doc) => doc.userId) },
    })
      .select("email")
      .lean<Array<{ _id: Types.ObjectId; email?: string }>>();
    const emailById = new Map(
      users.map((user) => [user._id.toString(), user.email ?? null]),
    );
    return docs.map((doc) =>
      toApiKeyCollaboratorOutDto(
        doc,
        emailById.get(doc.userId.toString()) ?? null,
      ),
    );
  }

  async create(
    input: CreateApiKeyCollaboratorDto,
  ): Promise<ApiKeyCollaboratorOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const userId = new Types.ObjectId(input.userId);

    const apiKey = await ApiKeyModel.findById(apiKeyId).select("userId").lean();
    if (!apiKey) {
      throw new Error("API key not found");
    }
    if (apiKey.userId.equals(userId)) {
      throw new Error("Owner cannot be added as a collaborator");
    }

    const user = await UserModel.findById(userId).select("_id").lean();
    if (!user) {
      throw new Error("User not found");
    }

    try {
      const doc = await ApiKeyCollaboratorModel.create({
        apiKeyId,
        userId,
        permissions: input.permissions,
      });
      return toApiKeyCollaboratorOutDto(doc.toObject() as ApiKeyCollaboratorDoc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("User is already a collaborator on this API key");
      }
      throw error;
    }
  }

  async updatePermissions(
    apiKeyId: Types.ObjectId,
    userId: Types.ObjectId,
    permissions: CollaboratorPermissions,
  ): Promise<ApiKeyCollaboratorOutDto> {
    const updated = await ApiKeyCollaboratorModel.findOneAndUpdate(
      { apiKeyId, userId },
      { $set: { permissions } },
      { new: true },
    ).lean<ApiKeyCollaboratorDoc>();

    if (!updated) {
      throw new Error("Collaborator not found");
    }

    return toApiKeyCollaboratorOutDto(updated);
  }

  async remove(
    apiKeyId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<ApiKeyCollaboratorOutDto> {
    const deleted = await ApiKeyCollaboratorModel.findOneAndDelete({
      apiKeyId,
      userId,
    }).lean<ApiKeyCollaboratorDoc>();

    if (!deleted) {
      throw new Error("Collaborator not found");
    }

    return toApiKeyCollaboratorOutDto(deleted);
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await ApiKeyCollaboratorModel.deleteMany({ apiKeyId });
  }
}

export const apiKeyCollaboratorService = new ApiKeyCollaboratorService();

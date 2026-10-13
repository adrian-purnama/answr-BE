import { Types } from "mongoose";
import type {
  CreateSnippetDto,
  SnippetOutDto,
  UpdateSnippetDto,
} from "../../dto/snippet.dto";
import { ChunkModel } from "../../models/chunk/chunk.model";
import { TopicModel } from "../../models/topic/topic.model";
import type { TopicInterface } from "../../models/topic/topic.interface";
import {
  parseContentToBlocks,
  serializeContentBlocks,
  type ContentBlock,
} from "../../utils/contentReferences";
import {
  deleteArticleFileIfUnused,
  findOwnedArticleFile,
  uploadArticleFile,
} from "../../buckets/articleBucket";
import { processArticleImage } from "../../utils/articleImageProcess";
import { deleteChunkPoints } from "../../utils/qdrantClient";
import { resyncTopics } from "../../utils/topicChunkSync";
import {
  assertImageFile,
  countImageBlocks,
  countTopicCharacters,
  mediaIdsFromContent,
  topicContentToString,
} from "../../validation/topic";
import { entitlementService } from "../entitlement/entitlement.service";
import {
  authorshipEmails,
  authorshipIds,
  userService,
} from "../user/user.service";

type TopicDoc = TopicInterface & { _id: Types.ObjectId };

function toSnippetOutDto(
  doc: TopicDoc,
  emails: Map<string, string>,
): SnippetOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    topicName: doc.topicName,
    topicContent: topicContentToString(doc.topicContent),
    type: "snippet",
    order: doc.order,
    enabled: doc.enabled,
    isSynced: doc.isSynced,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    ...authorshipEmails(doc, emails),
  };
}

async function snippetOut(doc: TopicDoc): Promise<SnippetOutDto> {
  const emails = await userService.emailsByIds(authorshipIds([doc]));
  return toSnippetOutDto(doc, emails);
}

export class SnippetService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<SnippetOutDto[]> {
    const docs = await TopicModel.find({
      apiKeyId,
      type: "snippet",
    })
      .sort({ order: 1, updatedAt: -1 })
      .lean<TopicDoc[]>();
    const emails = await userService.emailsByIds(authorshipIds(docs));
    return docs.map((doc) => toSnippetOutDto(doc, emails));
  }

  async create(
    userId: Types.ObjectId,
    input: CreateSnippetDto,
    actorId: Types.ObjectId = userId,
  ): Promise<SnippetOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const allowed = await entitlementService.canCreateSnippet(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Snippet limit reached for your plan");
    }

    const content = input.topicContent ?? "";
    const allowedImages = await entitlementService.canAddImagesToSnippet(
      userId,
      apiKeyId,
      countImageBlocks(content),
    );
    if (!allowedImages) {
      throw new Error("Image limit reached for your plan");
    }

    const allowedChars = await entitlementService.canAddCharactersToSnippet(
      userId,
      apiKeyId,
      countTopicCharacters(content),
    );
    if (!allowedChars) {
      throw new Error("Character limit reached for your plan");
    }

    const last = await TopicModel.findOne({
      apiKeyId,
      type: "snippet",
    })
      .sort({ order: -1 })
      .select("order")
      .lean<{ order: number } | null>();
    const order = last ? last.order + 1 : 0;

    const doc = await TopicModel.create({
      userId,
      apiKeyId,
      createdBy: actorId,
      updatedBy: actorId,
      topicName: input.topicName,
      topicContent: content,
      type: "snippet",
      order,
      enabled: true,
      isSynced: "not-synced",
    });

    return snippetOut(doc.toObject() as TopicDoc);
  }

  async getById(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    snippetId: string,
  ): Promise<SnippetOutDto> {
    const doc = await this.findOwned(userId, apiKeyId, snippetId);
    return snippetOut(doc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    snippetId: string,
    patch: UpdateSnippetDto,
    files: Express.Multer.File[] = [],
    actorId: Types.ObjectId = userId,
  ): Promise<SnippetOutDto> {
    const existing = await this.findOwned(userId, apiKeyId, snippetId);

    const $set: Record<string, unknown> = {};
    if (patch.topicName !== undefined) $set.topicName = patch.topicName;
    if (patch.enabled !== undefined) $set.enabled = patch.enabled;
    if (patch.order !== undefined) $set.order = patch.order;

    let orphanIds: string[] = [];

    if (patch.topicContent !== undefined) {
      const allowedImages = await entitlementService.canAddImagesToSnippet(
        userId,
        apiKeyId,
        countImageBlocks(patch.topicContent),
      );
      if (!allowedImages) {
        throw new Error("Image limit reached for your plan");
      }

      const allowedChars = await entitlementService.canAddCharactersToSnippet(
        userId,
        apiKeyId,
        countTopicCharacters(patch.topicContent),
      );
      if (!allowedChars) {
        throw new Error("Character limit reached for your plan");
      }

      const resolved = await this.resolveContentString(
        patch.topicContent,
        files,
        userId,
        apiKeyId,
        existing._id,
      );
      orphanIds = mediaIdsFromContent(
        topicContentToString(existing.topicContent),
      ).filter((id) => !mediaIdsFromContent(resolved).includes(id));
      $set.topicContent = resolved;
    }

    if (patch.topicContent !== undefined || patch.topicName !== undefined) {
      $set.isSynced = "not-synced";
    }

    if (Object.keys($set).length === 0) {
      return snippetOut(existing);
    }

    $set.updatedBy = actorId;
    const updated = await TopicModel.findOneAndUpdate(
      { _id: existing._id, apiKeyId, type: "snippet" },
      { $set },
      { new: true },
    ).lean<TopicDoc>();

    if (!updated) {
      throw new Error("Snippet not found");
    }

    if (orphanIds.length > 0) {
      await Promise.all(
        orphanIds.map((id) => deleteArticleFileIfUnused(id, apiKeyId)),
      );
    }

    return snippetOut(updated);
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    snippetId: string,
  ): Promise<void> {
    const existing = await this.findOwned(userId, apiKeyId, snippetId);
    const mediaIds = mediaIdsFromContent(
      topicContentToString(existing.topicContent),
    );
    await ChunkModel.deleteMany({ topicId: existing._id });
    await deleteChunkPoints({ topicId: existing._id.toString() });
    await TopicModel.deleteOne({ _id: existing._id });
    await Promise.all(
      mediaIds.map((id) => deleteArticleFileIfUnused(id, apiKeyId)),
    );
  }

  /** Purge snippet topics for a key (chunks/Qdrant/GridFS handled by article cascade). */
  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await TopicModel.deleteMany({ apiKeyId, type: "snippet" });
  }

  async resync(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    force = false,
  ): Promise<string[]> {
    return resyncTopics(
      {
        userId,
        apiKeyId,
        type: "snippet",
      },
      { force },
    );
  }

  private async resolveContentString(
    content: string,
    files: Express.Multer.File[],
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: Types.ObjectId,
  ): Promise<string> {
    const byKey = new Map(files.map((f) => [f.fieldname, f]));
    const resolved: ContentBlock[] = [];

    for (const block of parseContentToBlocks(content)) {
      if (block.type !== "image") {
        resolved.push(block);
        continue;
      }

      const file = byKey.get(block.id);
      if (file) {
        assertImageFile(file);
        const processed = await processArticleImage(
          file.buffer,
          file.mimetype,
        );
        const uploaded = await uploadArticleFile({
          buffer: processed.buffer,
          filename: processed.filename,
          contentType: processed.contentType,
          userId,
          apiKeyId,
          metadata: {
            topicId: topicId.toString(),
            kind: "snippet",
          },
        });
        resolved.push({
          type: "image",
          id: uploaded.id.toString(),
          ...(block.alt ? { alt: block.alt } : {}),
        });
        continue;
      }

      if (!Types.ObjectId.isValid(block.id)) {
        throw new Error(`Missing upload for fileKey "${block.id}"`);
      }

      const owned = await findOwnedArticleFile(block.id, userId, apiKeyId);
      if (!owned) {
        throw new Error("Image not found or not owned");
      }
      resolved.push(block);
    }

    return serializeContentBlocks(resolved);
  }

  private async findOwned(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    snippetId: string,
  ): Promise<TopicDoc> {
    if (!Types.ObjectId.isValid(snippetId)) {
      throw new Error("Snippet not found");
    }
    const doc = await TopicModel.findOne({
      _id: new Types.ObjectId(snippetId),
      apiKeyId,
      type: "snippet",
    }).lean<TopicDoc>();
    if (!doc) {
      throw new Error("Snippet not found");
    }
    return doc;
  }
}

export const snippetService = new SnippetService();

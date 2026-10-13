import JSZip from "jszip";
import { Types } from "mongoose";
import type {
  ArticleDetailOutDto,
  ArticleOutDto,
  ArticleSyncStatus,
  CreateArticleDto,
  ExportArticleOutDto,
  ImportArticleDto,
  PublicArticleDetailOutDto,
  TopicOutDto,
  UpdateArticleDto,
} from "../../dto/article.dto";
import type {
  CreateTopicDto,
  ReorderTopicsDto,
  UpdateTopicDto,
} from "../../dto/topic.dto";
import { ArticleModel } from "../../models/article/article.model";
import type { ArticleInterface } from "../../models/article/article.interface";
import { ChunkModel } from "../../models/chunk/chunk.model";
import type { ChunkInterface } from "../../models/chunk/chunk.interface";
import { TopicModel } from "../../models/topic/topic.model";
import type {
  TopicInterface,
  TopicSyncStatus,
} from "../../models/topic/topic.interface";
import {
  parseContentToBlocks,
  serializeContentBlocks,
  type ContentBlock,
} from "../../utils/contentReferences";
import {
  deleteAllArticleFilesForApiKey,
  deleteArticleFileIfUnused,
  findArticleFile,
  findOwnedArticleFile,
  openArticleDownload,
  uploadArticleFile,
} from "../../buckets/articleBucket";
import {
  parseArticleMarkdown,
  serializeArticleMarkdown,
} from "../../utils/articleMarkdown";
import { processArticleImage } from "../../utils/articleImageProcess";
import { fetchRemoteImageBuffer } from "../../utils/fetchRemoteImage";
import { ollamaClient } from "../../llm/ollama/ollamaClient";
import { rerankerClient } from "../../llm/reranker/rerankerClient";
import { deleteChunkPoints, searchChunkPoints } from "../../utils/qdrantClient";
import { withSyncLock } from "../../locks/syncLock";
import { resyncTopics } from "../../utils/topicChunkSync";
import {
  assertImageFile,
  countImageBlocks,
  countTopicCharacters,
  MAX_TOPIC_IMAGE_BYTES,
  mediaIdsFromContent,
  topicContentToString,
} from "../../validation/topic";
import { entitlementService } from "../entitlement/entitlement.service";
import {
  authorshipEmails,
  authorshipIds,
  userService,
} from "../user/user.service";

type ChunkDoc = ChunkInterface & { _id: Types.ObjectId };

type ArticleDoc = ArticleInterface & { _id: Types.ObjectId };
type TopicDoc = TopicInterface & { _id: Types.ObjectId };

export type RelevantChunkSource = "vector" | "lexical";

export type RelevantChunkResult = {
  chunkId: string;
  topicId: string;
  articleId?: string;
  content: string;
  score: number;
  sources: RelevantChunkSource[];
};

type RetrievalCandidate = {
  chunkId: string;
  topicId: string;
  articleId?: string;
  content: string;
  sources: Set<RelevantChunkSource>;
  vectorScore: number;
  lexicalScore: number;
};


//ANCHOR : set later for qdrant retrival
/** Cosine floor for vector-only (or weak dual) hits. */
const DEFAULT_MIN_VECTOR_SCORE = 0.42;
/** Absolute RRF floor (~single-channel rank ≤ 5). */
const DEFAULT_MIN_RRF_SCORE = 1 / (60 + 5);
/** Keep hits within this fraction of the best RRF score. */
const DEFAULT_RRF_RELATIVE_FLOOR = 0.55;
/** Candidate pool per expanded query before rerank. */
const ENHANCED_CANDIDATE_TOP_K = 20;
/** Chunks passed to the agent after rerank. */
const ENHANCED_RERANK_KEEP = 8;
/** Drop reranker scores below this. Relevant hits sit near 1. */
const ENHANCED_MIN_RELEVANCE = 0.1;

function computeSyncStatus(statuses: TopicSyncStatus[]): ArticleSyncStatus {
  if (statuses.length === 0) return "not-synced";
  if (statuses.every((status) => status === "synced")) return "synced";
  if (statuses.every((status) => status !== "synced")) return "not-synced";
  return "partial";
}

function toArticleOutDto(
  doc: ArticleDoc,
  emails: Map<string, string>,
  syncStatus: ArticleSyncStatus = "not-synced",
): ArticleOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    title: doc.title,
    description: doc.description ?? "",
    enabled: doc.enabled,
    syncStatus,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    ...authorshipEmails(doc, emails),
  };
}

function toTopicOutDto(
  doc: TopicDoc,
  emails: Map<string, string>,
): TopicOutDto {
  return {
    id: doc._id.toString(),
    articleId: doc.articleId?.toString(),
    topicName: doc.topicName,
    topicContent: topicContentToString(doc.topicContent),
    type: doc.type,
    order: doc.order,
    enabled: doc.enabled,
    isSynced: doc.isSynced,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    ...authorshipEmails(doc, emails),
  };
}

async function articleOut(
  doc: ArticleDoc,
  syncStatus: ArticleSyncStatus = "not-synced",
): Promise<ArticleOutDto> {
  const emails = await userService.emailsByIds(authorshipIds([doc]));
  return toArticleOutDto(doc, emails, syncStatus);
}

async function topicOut(doc: TopicDoc): Promise<TopicOutDto> {
  const emails = await userService.emailsByIds(authorshipIds([doc]));
  return toTopicOutDto(doc, emails);
}

async function topicOutMany(docs: TopicDoc[]): Promise<TopicOutDto[]> {
  const emails = await userService.emailsByIds(authorshipIds(docs));
  return docs.map((doc) => toTopicOutDto(doc, emails));
}

async function articleDetailOut(
  article: ArticleDoc,
  topics: TopicDoc[],
): Promise<ArticleDetailOutDto> {
  const emails = await userService.emailsByIds(authorshipIds([article, ...topics]));
  return {
    ...toArticleOutDto(
      article,
      emails,
      computeSyncStatus(topics.map((topic) => topic.isSynced)),
    ),
    topics: topics.map((topic) => toTopicOutDto(topic, emails)),
  };
}

function slugFilename(title: string, ext: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "article"}.${ext}`;
}

function extFromMime(mime: string, filename: string): string {
  const fromName = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "bin";
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export class ArticleService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<ArticleOutDto[]> {
    const docs = await ArticleModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<ArticleDoc[]>();

    if (docs.length === 0) return [];

    const topicRows = await TopicModel.find({
      apiKeyId,
      type: "content",
      articleId: { $exists: true },
    })
      .select({ articleId: 1, isSynced: 1 })
      .lean<Array<{ articleId: Types.ObjectId; isSynced: TopicSyncStatus }>>();

    const statusesByArticle = new Map<string, TopicSyncStatus[]>();
    for (const row of topicRows) {
      const key = row.articleId.toString();
      const list = statusesByArticle.get(key);
      if (list) list.push(row.isSynced);
      else statusesByArticle.set(key, [row.isSynced]);
    }

    const emails = await userService.emailsByIds(authorshipIds(docs));
    return docs.map((doc) =>
      toArticleOutDto(
        doc,
        emails,
        computeSyncStatus(statusesByArticle.get(doc._id.toString()) ?? []),
      ),
    );
  }

  async create(
    userId: Types.ObjectId,
    input: CreateArticleDto,
    actorId: Types.ObjectId = userId,
  ): Promise<ArticleOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const allowed = await entitlementService.canCreateArticle(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Article limit reached for your plan");
    }

    const doc = await ArticleModel.create({
      userId,
      apiKeyId,
      createdBy: actorId,
      updatedBy: actorId,
      title: input.title,
      description: input.description ?? "",
      enabled: true,
    });

    return articleOut(doc.toObject() as ArticleDoc);
  }

  async getById(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<ArticleDetailOutDto> {
    const article = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const topics = await TopicModel.find({
      articleId: article._id,
      apiKeyId,
    })
      .sort({ order: 1 })
      .lean<TopicDoc[]>();

    return articleDetailOut(article, topics);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    patch: UpdateArticleDto,
    actorId: Types.ObjectId = userId,
  ): Promise<ArticleOutDto> {
    const existing = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const updated = await ArticleModel.findByIdAndUpdate(
      existing._id,
      { $set: { ...patch, updatedBy: actorId } },
      { new: true },
    ).lean<ArticleDoc>();

    if (!updated) {
      throw new Error("Article not found");
    }

    const topicStatuses = await TopicModel.find({
      articleId: updated._id,
      apiKeyId,
    })
      .select({ isSynced: 1 })
      .lean<Array<{ isSynced: TopicSyncStatus }>>();

    return articleOut(
      updated,
      computeSyncStatus(topicStatuses.map((topic) => topic.isSynced)),
    );
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<void> {
    const existing = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const topics = await TopicModel.find({
      articleId: existing._id,
      apiKeyId,
    })
      .select("topicContent")
      .lean<TopicDoc[]>();

    const mediaIds = topics.flatMap((topic) =>
      mediaIdsFromContent(topicContentToString(topic.topicContent)),
    );

    await ChunkModel.deleteMany({ articleId: existing._id });
    await deleteChunkPoints({ articleId: existing._id.toString() });

    await TopicModel.deleteMany({
      articleId: existing._id,
      apiKeyId,
    });
    await ArticleModel.deleteOne({ _id: existing._id });
    // After topics are gone so shared images still referenced elsewhere are kept.
    await this.deleteMediaIds(mediaIds, apiKeyId);
  }

  /** Purge all articles, content topics, chunks, Qdrant points, and article GridFS for a key. */
  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await deleteChunkPoints({ apiKeyId: apiKeyId.toString() });
    await ChunkModel.deleteMany({ apiKeyId });
    await TopicModel.deleteMany({ apiKeyId, type: "content" });
    await ArticleModel.deleteMany({ apiKeyId });
    // Wipe after topics so any shared media is gone with the tenant.
    await deleteAllArticleFilesForApiKey(apiKeyId);
  }

  async importMarkdown(
    userId: Types.ObjectId,
    input: ImportArticleDto,
    actorId: Types.ObjectId = userId,
  ): Promise<ArticleDetailOutDto> {
    if (!input.markdown?.trim()) {
      throw new Error("markdown must be a non-empty string");
    }
    return this.importFromParsed(
      userId,
      new Types.ObjectId(input.apiKeyId),
      parseArticleMarkdown(input.markdown),
      new Map(),
      actorId,
    );
  }

  async importZip(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    zipBuffer: Buffer,
    actorId: Types.ObjectId = userId,
  ): Promise<ArticleDetailOutDto> {
    const zip = await JSZip.loadAsync(zipBuffer);
    const mdEntry =
      zip.file("article.md") ??
      Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith(".md"),
      );
    if (!mdEntry) {
      throw new Error("Zip must contain article.md");
    }

    const markdown = await mdEntry.async("string");
    const parsed = parseArticleMarkdown(markdown);

    const imageBuffers = new Map<string, { buffer: Buffer; filename: string; contentType: string }>();
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const normalized = path.replace(/\\/g, "/");
      if (!normalized.startsWith("images/")) continue;
      const filename = normalized.slice("images/".length);
      if (!filename || filename.includes("/")) continue;
      const mediaId = filename.includes(".")
        ? filename.slice(0, filename.lastIndexOf("."))
        : filename;
      const buffer = Buffer.from(await entry.async("uint8array"));
      if (buffer.length > MAX_TOPIC_IMAGE_BYTES) {
        throw new Error("Image must be 5MB or smaller");
      }
      const ext = filename.includes(".")
        ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
        : "png";
      const contentType =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : ext === "svg"
                ? "image/svg+xml"
                : "image/png";
      imageBuffers.set(mediaId, { buffer, filename, contentType });
    }

    return this.importFromParsed(userId, apiKeyId, parsed, imageBuffers, actorId);
  }

  async exportZip(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<ExportArticleOutDto> {
    const detail = await this.getById(userId, apiKeyId, articleId);
    const markdown = serializeArticleMarkdown(
      detail.title,
      detail.topics.map((t) => ({
        topicName: t.topicName,
        topicContent: t.topicContent,
      })),
      detail.description ?? "",
    );

    const zip = new JSZip();
    zip.file("article.md", markdown);

    const seen = new Set<string>();
    for (const topic of detail.topics) {
      for (const block of parseContentToBlocks(topic.topicContent)) {
        if (block.type !== "image") continue;
        if (seen.has(block.id)) continue;
        seen.add(block.id);

        const file = await findOwnedArticleFile(
          block.id,
          userId,
          apiKeyId,
        );
        if (!file) continue;

        const contentType =
          typeof file.metadata?.contentType === "string"
            ? file.metadata.contentType
            : "application/octet-stream";
        const ext = extFromMime(contentType, file.filename ?? "");
        const buffer = await streamToBuffer(openArticleDownload(block.id));
        zip.file(`images/${block.id}.${ext}`, buffer);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    return {
      filename: slugFilename(detail.title, "zip"),
      zipBase64: zipBuffer.toString("base64"),
    };
  }

  async listTopics(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<TopicOutDto[]> {
    const article = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const topics = await TopicModel.find({
      articleId: article._id,
      apiKeyId,
    })
      .sort({ order: 1 })
      .lean<TopicDoc[]>();
    return topicOutMany(topics);
  }

  async createTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    input: CreateTopicDto,
    files: Express.Multer.File[] = [],
    actorId: Types.ObjectId = userId,
  ): Promise<TopicOutDto> {
    const article = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const allowed = await entitlementService.canCreateTopic(
      userId,
      apiKeyId,
      article._id,
    );
    if (!allowed) {
      throw new Error("Topic limit reached for your plan");
    }

    const inputContent = input.topicContent ?? "";
    const allowedImages = await entitlementService.canAddImagesToTopic(
      userId,
      apiKeyId,
      article._id,
      null,
      countImageBlocks(inputContent),
    );
    if (!allowedImages) {
      throw new Error("Image limit reached for your plan");
    }

    const allowedChars = await entitlementService.canAddCharactersToTopic(
      userId,
      apiKeyId,
      article._id,
      null,
      countTopicCharacters(inputContent),
    );
    if (!allowedChars) {
      throw new Error("Character limit reached for your plan");
    }

    const last = await TopicModel.findOne({ articleId: article._id })
      .sort({ order: -1 })
      .select("order")
      .lean<{ order: number } | null>();
    const order = last ? last.order + 1 : 0;

    const resolved = await this.resolveContentString(
      inputContent,
      files,
      userId,
      apiKeyId,
      article._id,
    );

    const doc = await TopicModel.create({
      userId,
      apiKeyId,
      createdBy: actorId,
      updatedBy: actorId,
      articleId: article._id,
      topicName: input.topicName,
      topicContent: resolved,
      type: "content",
      order,
      enabled: true,
      isSynced: "not-synced",
    });

    await this.touchArticleUpdatedBy(article._id, actorId);
    return topicOut(doc.toObject() as TopicDoc);
  }

  async getTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    topicId: string,
  ): Promise<TopicOutDto> {
    const topic = await this.findOwnedTopic(
      userId,
      apiKeyId,
      articleId,
      topicId,
    );
    return topicOut(topic);
  }

  async updateTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    topicId: string,
    patch: UpdateTopicDto,
    files: Express.Multer.File[] = [],
    actorId: Types.ObjectId = userId,
  ): Promise<TopicOutDto> {
    const existing = await this.findOwnedTopic(
      userId,
      apiKeyId,
      articleId,
      topicId,
    );

    const $set: Record<string, unknown> = {};
    if (patch.topicName !== undefined) $set.topicName = patch.topicName;
    if (patch.enabled !== undefined) $set.enabled = patch.enabled;
    if (patch.order !== undefined) $set.order = patch.order;

    let orphanIds: string[] = [];

    if (patch.topicContent !== undefined) {
      if (!existing.articleId) {
        throw new Error("Topic not found");
      }
      const articleObjectId = existing.articleId;
      const allowedImages = await entitlementService.canAddImagesToTopic(
        userId,
        apiKeyId,
        articleObjectId,
        existing._id,
        countImageBlocks(patch.topicContent),
      );
      if (!allowedImages) {
        throw new Error("Image limit reached for your plan");
      }

      const allowedChars = await entitlementService.canAddCharactersToTopic(
        userId,
        apiKeyId,
        articleObjectId,
        existing._id,
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
        articleObjectId,
        existing._id,
      );

      const oldIds = new Set(
        mediaIdsFromContent(topicContentToString(existing.topicContent)),
      );
      const newIds = new Set(mediaIdsFromContent(resolved));
      orphanIds = [...oldIds].filter((id) => !newIds.has(id));

      $set.topicContent = resolved;
    }

    if (Object.keys($set).length === 0) {
      throw new Error("No valid fields to update");
    }

    $set.updatedBy = actorId;
    if ($set.topicName !== undefined || $set.topicContent !== undefined) {
      $set.isSynced = "not-synced";
    }

    const updated = await TopicModel.findByIdAndUpdate(
      existing._id,
      { $set },
      { new: true },
    ).lean<TopicDoc>();

    if (!updated) {
      throw new Error("Topic not found");
    }

    // After topic content is saved so unused check sees the new refs.
    if (orphanIds.length > 0) {
      await this.deleteMediaIds(orphanIds, apiKeyId);
    }

    await this.touchArticleUpdatedBy(existing.articleId, actorId);
    return topicOut(updated);
  }

  async deleteTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    topicId: string,
    actorId: Types.ObjectId = userId,
  ): Promise<void> {
    const existing = await this.findOwnedTopic(
      userId,
      apiKeyId,
      articleId,
      topicId,
    );
    const mediaIds = mediaIdsFromContent(
      topicContentToString(existing.topicContent),
    );

    await ChunkModel.deleteMany({ topicId: existing._id });
    await deleteChunkPoints({ topicId: existing._id.toString() });
    await TopicModel.deleteOne({ _id: existing._id });
    await TopicModel.updateMany(
      { articleId: existing.articleId, apiKeyId },
      { $set: { isSynced: "not-synced" } },
    );
    await this.touchArticleUpdatedBy(existing.articleId, actorId);
    await this.deleteMediaIds(mediaIds, apiKeyId);
  }

  async reorderTopics(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    input: ReorderTopicsDto,
  ): Promise<TopicOutDto[]> {
    const article = await this.findOwnedArticle(userId, apiKeyId, articleId);
    const existing = await TopicModel.find({
      articleId: article._id,
      apiKeyId,
    }).lean<TopicDoc[]>();

    const existingIds = new Set(existing.map((t) => t._id.toString()));
    if (input.topicIds.length !== existing.length) {
      throw new Error("topicIds must include every topic in the article");
    }
    for (const id of input.topicIds) {
      if (!existingIds.has(id)) {
        throw new Error(
          "topicIds contains a topic that does not belong to this article",
        );
      }
    }
    if (new Set(input.topicIds).size !== input.topicIds.length) {
      throw new Error("topicIds must be unique");
    }

    await Promise.all(
      input.topicIds.map((id, index) =>
        TopicModel.updateOne(
          { _id: new Types.ObjectId(id), articleId: article._id },
          { $set: { order: index } },
        ),
      ),
    );

    return this.listTopics(userId, apiKeyId, articleId);
  }

  async getOwnedMediaStream(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mediaId: string,
  ): Promise<{ contentType: string; stream: NodeJS.ReadableStream }> {
    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Invalid media id");
    }
    const file = await findOwnedArticleFile(mediaId, userId, apiKeyId);
    if (!file) {
      throw new Error("File not found");
    }
    const contentType =
      (typeof file.metadata?.contentType === "string"
        ? file.metadata.contentType
        : undefined) ?? "application/octet-stream";
    return {
      contentType,
      stream: openArticleDownload(mediaId),
    };
  }

  /**
   * Ingest an image from multipart file or remote URL into article GridFS.
   * Returns the permanent mediaId used in {{image id="…"}} tokens.
   */
  async ingestMedia(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    opts: {
      file?: Express.Multer.File;
      url?: string;
      articleId?: string;
    },
  ): Promise<{ mediaId: string }> {
    let articleIdMeta: string | undefined;
    let articleObjectId = new Types.ObjectId();
    if (opts.articleId) {
      if (!Types.ObjectId.isValid(opts.articleId)) {
        throw new Error("Article not found");
      }
      await this.findOwnedArticle(userId, apiKeyId, opts.articleId);
      articleIdMeta = opts.articleId;
      articleObjectId = new Types.ObjectId(opts.articleId);
    }

    const allowed = await entitlementService.canAddImagesToTopic(
      userId,
      apiKeyId,
      articleObjectId,
      null,
      1,
    );
    if (!allowed) {
      throw new Error("Image limit reached for your plan");
    }

    let rawBuffer: Buffer;
    let contentTypeHint: string | undefined;

    if (opts.file) {
      assertImageFile(opts.file);
      rawBuffer = opts.file.buffer;
      contentTypeHint = opts.file.mimetype;
    } else if (opts.url?.trim()) {
      const remote = await fetchRemoteImageBuffer(opts.url.trim());
      rawBuffer = remote.buffer;
      contentTypeHint = remote.contentType;
    } else {
      throw new Error("Provide an image file or url");
    }

    const processed = await processArticleImage(rawBuffer, contentTypeHint);
    const uploaded = await uploadArticleFile({
      buffer: processed.buffer,
      filename: processed.filename,
      contentType: processed.contentType,
      userId,
      apiKeyId,
      metadata: {
        ...(articleIdMeta ? { articleId: articleIdMeta } : {}),
        source: "ingest",
      },
    });

    return { mediaId: uploaded.id.toString() };
  }

  /** Article + topics scoped to an API key (e.g. public widget embed). */
  async getPublicDetail(
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<PublicArticleDetailOutDto> {
    if (!Types.ObjectId.isValid(articleId)) {
      throw new Error("Article not found");
    }

    const article = await ArticleModel.findOne({
      _id: new Types.ObjectId(articleId),
      apiKeyId,
      enabled: true,
    }).lean<ArticleDoc>();
    if (!article) {
      throw new Error("Article not found");
    }

    const topics = await TopicModel.find({
      articleId: article._id,
      apiKeyId,
      enabled: true,
    })
      .sort({ order: 1 })
      .lean<TopicDoc[]>();

    return {
      id: article._id.toString(),
      title: article.title,
      description: article.description ?? "",
      enabled: article.enabled,
      topics: topics.map((topic) => ({
        id: topic._id.toString(),
        topicName: topic.topicName,
        enabled: topic.enabled,
        topicContent: topicContentToString(topic.topicContent),
      })),
    };
  }

  /** Media stream when the file belongs to the given API key. */
  async getPublicMediaStream(
    apiKeyId: Types.ObjectId,
    mediaId: string,
  ): Promise<{ contentType: string; stream: NodeJS.ReadableStream }> {
    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Media not found");
    }

    const file = await findArticleFile(mediaId);
    if (!file) {
      throw new Error("Media not found");
    }

    const fileApiKeyId = file.metadata?.apiKeyId;
    const matches =
      fileApiKeyId instanceof Types.ObjectId
        ? fileApiKeyId.equals(apiKeyId)
        : String(fileApiKeyId) === apiKeyId.toString();

    if (!matches) {
      throw new Error("Media not found");
    }

    const contentType =
      (typeof file.metadata?.contentType === "string"
        ? file.metadata.contentType
        : undefined) ?? "application/octet-stream";

    return {
      contentType,
      stream: openArticleDownload(mediaId),
    };
  }

  private async importFromParsed(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    parsed: ReturnType<typeof parseArticleMarkdown>,
    imageBuffers: Map<
      string,
      { buffer: Buffer; filename: string; contentType: string }
    >,
    actorId: Types.ObjectId,
  ): Promise<ArticleDetailOutDto> {
    const allowedArticle = await entitlementService.canCreateArticle(
      userId,
      apiKeyId,
    );
    if (!allowedArticle) {
      throw new Error("Article limit reached for your plan");
    }

    const allowedTopics = await entitlementService.canCreateTopicsBatch(
      userId,
      apiKeyId,
      null,
      parsed.topics.length,
    );
    if (!allowedTopics) {
      throw new Error("Topic limit reached for your plan");
    }

    for (const topic of parsed.topics) {
      const imageCount = countImageBlocks(topic.topicContent);
      const allowedImages = await entitlementService.canAddImagesToTopic(
        userId,
        apiKeyId,
        // placeholder    article not created yet; entitlement only checks plan cap
        new Types.ObjectId(),
        null,
        imageCount,
      );
      if (!allowedImages) {
        throw new Error("Image limit reached for your plan");
      }

      const allowedChars = await entitlementService.canAddCharactersToTopic(
        userId,
        apiKeyId,
        new Types.ObjectId(),
        null,
        countTopicCharacters(topic.topicContent),
      );
      if (!allowedChars) {
        throw new Error("Character limit reached for your plan");
      }
    }

    const article = await ArticleModel.create({
      userId,
      apiKeyId,
      createdBy: actorId,
      updatedBy: actorId,
      title: parsed.title,
      description: parsed.description ?? "",
      enabled: true,
    });

    const idMap = new Map<string, string>();
    for (const [oldId, file] of imageBuffers) {
      const processed = await processArticleImage(
        file.buffer,
        file.contentType,
      );
      const uploaded = await uploadArticleFile({
        buffer: processed.buffer,
        filename: processed.filename,
        contentType: processed.contentType,
        userId,
        apiKeyId,
        metadata: { articleId: article._id.toString() },
      });
      idMap.set(oldId, uploaded.id.toString());
    }

    const remappedTopics = parsed.topics.map((topic) => ({
      ...topic,
      topicContent: serializeContentBlocks(
        parseContentToBlocks(topic.topicContent).flatMap(
          (block): ContentBlock[] => {
            if (block.type !== "image") return [block];
            const newId = idMap.get(block.id);
            return newId ? [{ ...block, id: newId }] : [];
          },
        ),
      ),
    }));

    const topicDocs =
      remappedTopics.length === 0
        ? []
        : await TopicModel.insertMany(
            remappedTopics.map((topic, index) => ({
              userId,
              apiKeyId,
              createdBy: actorId,
              updatedBy: actorId,
              articleId: article._id,
              topicName: topic.topicName,
              topicContent: topic.topicContent,
              type: "content" as const,
              order: index,
              enabled: true,
              isSynced: "not-synced",
            })),
          );

    return articleDetailOut(
      article.toObject() as ArticleDoc,
      topicDocs.map((doc) => doc.toObject() as TopicDoc),
    );
  }

  private async resolveContentString(
    content: string,
    files: Express.Multer.File[],
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: Types.ObjectId,
    topicId?: Types.ObjectId,
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
            articleId: articleId.toString(),
            ...(topicId ? { topicId: topicId.toString() } : {}),
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

  private async deleteMediaIds(
    ids: string[],
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    await Promise.all(
      ids.map((id) => deleteArticleFileIfUnused(id, apiKeyId)),
    );
  }

  private async touchArticleUpdatedBy(
    articleId: Types.ObjectId | undefined,
    actorId: Types.ObjectId,
  ): Promise<void> {
    if (!articleId) return;
    await ArticleModel.updateOne(
      { _id: articleId },
      { $set: { updatedBy: actorId } },
    );
  }

  private async findOwnedArticle(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
  ): Promise<ArticleDoc> {
    const doc = await ArticleModel.findOne({
      _id: new Types.ObjectId(articleId),
      apiKeyId,
    }).lean<ArticleDoc>();
    if (!doc) {
      throw new Error("Article not found");
    }
    return doc;
  }

  private async findOwnedTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: string,
    topicId: string,
  ): Promise<TopicDoc> {
    await this.findOwnedArticle(userId, apiKeyId, articleId);
    const doc = await TopicModel.findOne({
      _id: new Types.ObjectId(topicId),
      articleId: new Types.ObjectId(articleId),
      apiKeyId,
    }).lean<TopicDoc>();
    if (!doc) {
      throw new Error("Topic not found");
    }
    return doc;
  }

  async resync(
    articleId: Types.ObjectId | null,
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    force = false,
  ): Promise<string[]> {
    if (articleId) {
      await this.findOwnedArticle(userId, apiKeyId, articleId.toString());
    }

    const lockKey = articleId
      ? `article-sync:${userId.toString()}:${apiKeyId.toString()}:${articleId.toString()}`
      : `article-sync:${userId.toString()}:${apiKeyId.toString()}`;

    return withSyncLock(
      lockKey,
      async (refresh) =>
        resyncTopics(
          {
            userId,
            apiKeyId,
            type: "content",
            ...(articleId ? { articleId } : {}),
          },
          { force, onProgress: refresh },
        ),
      {
        conflictMessage:
          "An article sync is already running. Try again shortly.",
      },
    );
  }

  async chunkArticle(
    articleId: Types.ObjectId | null,
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    force = false,
  ): Promise<string[]> {
    return this.resync(articleId, userId, apiKeyId, force);
  }

  async getRelevantChunks(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    message: string,
    options?: {
      vectorLimit?: number;
      lexicalLimit?: number;
      topK?: number;
      /** Minimum Qdrant cosine score for vector hits. */
      minVectorScore?: number;
      /** Absolute minimum fused RRF score. */
      minRrfScore?: number;
      /** Keep only candidates within this fraction of the best RRF. */
      rrfRelativeFloor?: number;
      /** Aborts the embed request. Used by batch-test question timeout. */
      signal?: AbortSignal;
    },
  ): Promise<RelevantChunkResult[]> {
    const query = message.trim();
    if (!query) {
      throw new Error("Message is required");
    }

    const vectorLimit = options?.vectorLimit ?? 20;
    const lexicalLimit = options?.lexicalLimit ?? 20;
    const topK = options?.topK ?? 8;
    const minVectorScore = options?.minVectorScore ?? DEFAULT_MIN_VECTOR_SCORE;
    const minRrfScore = options?.minRrfScore ?? DEFAULT_MIN_RRF_SCORE;
    const rrfRelativeFloor =
      options?.rrfRelativeFloor ?? DEFAULT_RRF_RELATIVE_FLOOR;

    const embedResponse = await ollamaClient.embed(
      query,
      undefined,
      options?.signal,
    );
    const vector = embedResponse.embeddings[0];
    if (!vector || vector.length === 0) {
      throw new Error("Empty embedding returned from Ollama");
    }

    const apiKeyIdStr = apiKeyId.toString();

    const [vectorHits, lexicalHits] = await Promise.all([
      searchChunkPoints({
        vector,
        apiKeyId: apiKeyIdStr,
        limit: vectorLimit,
        scoreThreshold: minVectorScore,
      }).catch(() => [] as Awaited<ReturnType<typeof searchChunkPoints>>),
      this.searchChunksLexical(
        userId,
        apiKeyId,
        query,
        lexicalLimit,
      ).catch(() => [] as RelevantChunkResult[]),
    ]);

    const byChunkId = new Map<
      string,
      RetrievalCandidate & { rrfScore: number }
    >();
    const rrfK = 60;

    for (let rank = 0; rank < vectorHits.length; rank++) {
      const hit = vectorHits[rank]!;
      const existing = byChunkId.get(hit.chunkId);
      const contrib = 1 / (rrfK + rank + 1);
      if (existing) {
        existing.sources.add("vector");
        existing.rrfScore += contrib;
        existing.vectorScore = Math.max(existing.vectorScore, hit.score);
        continue;
      }
      byChunkId.set(hit.chunkId, {
        chunkId: hit.chunkId,
        topicId: hit.topicId,
        articleId: hit.articleId,
        content: hit.content,
        sources: new Set<RelevantChunkSource>(["vector"]),
        rrfScore: contrib,
        vectorScore: hit.score,
        lexicalScore: 0,
      });
    }

    for (let rank = 0; rank < lexicalHits.length; rank++) {
      const hit = lexicalHits[rank]!;
      const existing = byChunkId.get(hit.chunkId);
      const contrib = 1 / (rrfK + rank + 1);
      if (existing) {
        existing.sources.add("lexical");
        existing.rrfScore += contrib;
        existing.lexicalScore = Math.max(existing.lexicalScore, hit.score);
        continue;
      }
      byChunkId.set(hit.chunkId, {
        chunkId: hit.chunkId,
        topicId: hit.topicId,
        articleId: hit.articleId,
        content: hit.content,
        sources: new Set<RelevantChunkSource>(["lexical"]),
        rrfScore: contrib,
        vectorScore: 0,
        lexicalScore: hit.score,
      });
    }

    const ranked = [...byChunkId.values()].sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
      // Prefer chunks that hit both channels when RRF ties
      return b.sources.size - a.sources.size;
    });

    const bestRrf = ranked[0]?.rrfScore ?? 0;
    const relativeFloor =
      bestRrf > 0 ? bestRrf * rrfRelativeFloor : minRrfScore;

    const scoreFiltered = ranked.filter((candidate) => {
      if (candidate.rrfScore < minRrfScore) return false;
      if (candidate.rrfScore < relativeFloor) return false;
      if (candidate.sources.has("vector")) {
        const vectorFloor = candidate.sources.has("lexical")
          ? minVectorScore * 0.85
          : minVectorScore;
        if (candidate.vectorScore < vectorFloor) return false;
      }
      return true;
    });

    const enabled = await this.filterEnabledChunkCandidates(
      userId,
      apiKeyId,
      scoreFiltered,
    );

    return enabled.slice(0, topK).map((candidate) => ({
      chunkId: candidate.chunkId,
      topicId: candidate.topicId,
      articleId: candidate.articleId,
      content: candidate.content,
      score: candidate.rrfScore,
      sources: [...candidate.sources],
    }));
  }

  /**
   * Multi-query retrieval, rerank, then full topic text when a hit was split
   * across chunks. Used only when the API key has enhanced retrieval on.
   */
  async getEnhancedChunks(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    queries: string[],
    rerankQuery: string,
    signal?: AbortSignal,
  ): Promise<RelevantChunkResult[]> {
    const uniqueQueries = [
      ...new Set(queries.map((query) => query.trim()).filter(Boolean)),
    ];
    if (uniqueQueries.length === 0) return [];

    const merged = new Map<string, RelevantChunkResult>();
    for (const query of uniqueQueries) {
      const hits = await this.getRelevantChunks(userId, apiKeyId, query, {
        topK: ENHANCED_CANDIDATE_TOP_K,
        signal,
      });
      for (const hit of hits) {
        const existing = merged.get(hit.chunkId);
        if (!existing || hit.score > existing.score) {
          merged.set(hit.chunkId, hit);
        }
      }
    }

    const candidates = [...merged.values()].sort((a, b) => b.score - a.score);
    if (candidates.length === 0) return [];

    let ranked = candidates.slice(0, ENHANCED_RERANK_KEEP);
    const rerankText = rerankQuery.trim() || uniqueQueries[0]!;
    try {
      const reranked = await rerankerClient.rerank(
        rerankText,
        candidates.map((candidate) => candidate.content),
      );
      ranked = reranked.results
        .filter(
          (result) =>
            result.index >= 0 &&
            result.index < candidates.length &&
            result.relevance_score >= ENHANCED_MIN_RELEVANCE,
        )
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, ENHANCED_RERANK_KEEP)
        .map((result) => {
          const candidate = candidates[result.index]!;
          return { ...candidate, score: result.relevance_score };
        });
    } catch {
      ranked = candidates.slice(0, ENHANCED_RERANK_KEEP);
    }

    return this.expandCutoffTopics(apiKeyId, ranked);
  }

  /** Replace a split chunk with the full topic, once per topic, score order kept. */
  private async expandCutoffTopics(
    apiKeyId: Types.ObjectId,
    chunks: RelevantChunkResult[],
  ): Promise<RelevantChunkResult[]> {
    if (chunks.length === 0) return [];

    const topicIds = [
      ...new Set(
        chunks
          .map((chunk) => chunk.topicId)
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
    if (topicIds.length === 0) return chunks;

    const counts = await ChunkModel.aggregate<{
      _id: Types.ObjectId;
      n: number;
    }>([
      { $match: { topicId: { $in: topicIds }, apiKeyId } },
      { $group: { _id: "$topicId", n: { $sum: 1 } } },
    ]);
    const splitIds = counts
      .filter((row) => row.n > 1)
      .map((row) => row._id);
    if (splitIds.length === 0) return chunks;

    const topics = await TopicModel.find({
      _id: { $in: splitIds },
      apiKeyId,
    })
      .select({ topicContent: 1 })
      .lean<Array<{ _id: Types.ObjectId; topicContent: unknown }>>();

    const fullText = new Map<string, string>();
    for (const topic of topics) {
      const text = topicContentToString(topic.topicContent).trim();
      if (text) fullText.set(topic._id.toString(), text);
    }

    const seenTopics = new Set<string>();
    const expanded: RelevantChunkResult[] = [];
    for (const chunk of chunks) {
      const topicText = fullText.get(chunk.topicId);
      if (!topicText) {
        expanded.push(chunk);
        continue;
      }
      if (seenTopics.has(chunk.topicId)) continue;
      seenTopics.add(chunk.topicId);
      expanded.push({ ...chunk, content: topicText });
    }
    return expanded;
  }

  /** Keep only chunks whose topic is enabled; content topics also need an enabled article. */
  private async filterEnabledChunkCandidates<
    T extends { topicId: string; articleId?: string },
  >(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    candidates: T[],
  ): Promise<T[]> {
    if (candidates.length === 0) return [];

    const topicIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.topicId)
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    if (topicIds.length === 0) return [];

    const topics = await TopicModel.find({
      _id: { $in: topicIds },
      apiKeyId,
      enabled: true,
    })
      .select({ _id: 1, articleId: 1, type: 1 })
      .lean<
        Array<{
          _id: Types.ObjectId;
          articleId?: Types.ObjectId;
          type: "content" | "snippet";
        }>
      >();

    const articleIds = [
      ...new Set(
        topics
          .filter((topic) => topic.type === "content" && topic.articleId)
          .map((topic) => topic.articleId!.toString()),
      ),
    ].map((id) => new Types.ObjectId(id));

    const articles =
      articleIds.length === 0
        ? []
        : await ArticleModel.find({
            _id: { $in: articleIds },
            apiKeyId,
            enabled: true,
          })
            .select({ _id: 1 })
            .lean<Array<{ _id: Types.ObjectId }>>();

    const enabledArticles = new Set(
      articles.map((article) => article._id.toString()),
    );
    const enabledTopics = new Map(
      topics.map((topic) => [
        topic._id.toString(),
        {
          type: topic.type,
          articleId: topic.articleId?.toString(),
        },
      ]),
    );

    return candidates.filter((candidate) => {
      const topic = enabledTopics.get(candidate.topicId);
      if (!topic) return false;
      if (topic.type === "snippet") return true;
      if (!topic.articleId || !candidate.articleId) return false;
      return (
        enabledArticles.has(candidate.articleId) &&
        topic.articleId === candidate.articleId
      );
    });
  }

  private async searchChunksLexical(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    message: string,
    limit: number,
  ): Promise<RelevantChunkResult[]> {
    const docs = await ChunkModel.find(
      {
        $text: { $search: message },
        apiKeyId,
      },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .lean<Array<ChunkDoc & { score?: number }>>();

    return docs.map((doc) => ({
      chunkId: doc._id.toString(),
      topicId: doc.topicId.toString(),
      articleId: doc.articleId?.toString(),
      content: doc.content,
      score: typeof doc.score === "number" ? doc.score : 0,
      sources: ["lexical"] as RelevantChunkSource[],
    }));
  }
}

export const articleService = new ArticleService();

import crypto from "crypto";
import { Types } from "mongoose";
import { logger } from "../logger/logger";
import { ChunkModel } from "../models/chunk/chunk.model";
import type { ChunkInterface } from "../models/chunk/chunk.interface";
import { TopicModel } from "../models/topic/topic.model";
import type { TopicInterface } from "../models/topic/topic.interface";
import { ollamaClient } from "../llm/ollama/ollamaClient";
import {
  deleteChunkPoints,
  ensureChunkCollection,
  upsertChunkPoints,
} from "./qdrantClient";
import { chunkPlainText } from "./textChunker";
import { topicContentToString } from "../validation/topic";

type TopicDoc = TopicInterface & { _id: Types.ObjectId };
type ChunkDoc = ChunkInterface & { _id: Types.ObjectId };

const logSource = "utils/topicChunkSync.ts";

/** An `in-progress` topic older than this lost its runner (crash/restart/deploy). */
export const SYNC_STUCK_MS = 30 * 60 * 1000;

/** Statuses a sync run is allowed to pick up and claim. */
const SYNC_PENDING = ["not-synced", "failed"] as const;

export type TopicSyncFilter = {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** When set, only sync topics for this article (content topics). */
  articleId?: Types.ObjectId;
  /** Restrict to topic type. */
  type: "content" | "snippet";
};

type TopicScopeQuery = {
  apiKeyId: Types.ObjectId;
  type: "content" | "snippet";
  articleId?: Types.ObjectId;
};

function scopeQuery(filter: TopicSyncFilter): TopicScopeQuery {
  return {
    apiKeyId: filter.apiKeyId,
    type: filter.type,
    ...(filter.articleId ? { articleId: filter.articleId } : {}),
  };
}

/**
 * Mark topics abandoned mid-sync as failed so the next run retries them.
 * `updatedAt` is the moment the topic entered `in-progress`: the claim bumps it,
 * and any content edit moves the topic out of `in-progress`.
 */
export async function reclaimStuckTopics(
  query: TopicScopeQuery,
): Promise<number> {
  const result = await TopicModel.updateMany(
    {
      ...query,
      isSynced: "in-progress",
      updatedAt: { $lt: new Date(Date.now() - SYNC_STUCK_MS) },
    },
    { $set: { isSynced: "failed" } },
  );

  if (result.modifiedCount > 0) {
    logger.warn(
      `Reclaimed ${result.modifiedCount} stuck topic(s) as failed`,
      logSource,
      "reclaimStuckTopics",
    );
  }

  return result.modifiedCount;
}

/**
 * Embed + upsert Mongo/Qdrant chunks for topics needing sync.
 * Returns successfully synced topic ids.
 *
 * Incremental by default: only `not-synced` and `failed` topics are picked up.
 * Pass `force` to re-embed every topic in scope.
 */
export async function resyncTopics(
  filter: TopicSyncFilter,
  options?: { force?: boolean; onProgress?: () => Promise<void> },
): Promise<string[]> {
  if (options?.force) {
    await TopicModel.updateMany(scopeQuery(filter), {
      $set: { isSynced: "not-synced" },
    });
  }

  return chunkTopics(filter, options?.onProgress);
}

export async function chunkTopics(
  filter: TopicSyncFilter,
  onProgress?: () => Promise<void>,
): Promise<string[]> {
  const query = scopeQuery(filter);

  await reclaimStuckTopics(query);

  const topics = await TopicModel.find({
    ...query,
    isSynced: { $in: SYNC_PENDING },
  }).lean<TopicDoc[]>();

  if (topics.length === 0) return [];

  const topicIds = topics.map((topic) => topic._id);

  try {
    await ollamaClient.assertReachable();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `Ollama preflight failed; marking ${topicIds.length} topic(s) failed: ${message}`,
      logSource,
      "chunkTopics",
    );
    await TopicModel.updateMany(
      { _id: { $in: topicIds } },
      { $set: { isSynced: "failed" } },
    );
    return [];
  }

  const syncedIds: string[] = [];
  const { userId, apiKeyId } = filter;

  for (const topic of topics) {
    const topicId = topic._id;

    // Atomic claim: a concurrent run must not embed the same topic twice.
    const claimed = await TopicModel.findOneAndUpdate(
      { _id: topicId, isSynced: { $in: SYNC_PENDING } },
      { $set: { isSynced: "in-progress" } },
    );
    if (!claimed) continue;

    try {
      await ChunkModel.deleteMany({ topicId });
      await deleteChunkPoints({ topicId: topicId.toString() });

      const plainText = topicContentToString(topic.topicContent).trim();

      if (!plainText) {
        await TopicModel.updateOne(
          { _id: topicId },
          { $set: { isSynced: "synced" } },
        );
        syncedIds.push(topicId.toString());
        continue;
      }

      const texts = await chunkPlainText(plainText);

      if (texts.length === 0) {
        await TopicModel.updateOne(
          { _id: topicId },
          { $set: { isSynced: "synced" } },
        );
        syncedIds.push(topicId.toString());
        continue;
      }

      const vectors: number[][] = [];
      for (const text of texts) {
        const response = await ollamaClient.embed(text);
        const vector = response.embeddings[0];
        if (!vector || vector.length === 0) {
          throw new Error("Empty embedding returned from Ollama");
        }
        vectors.push(vector);
      }

      const articleId = topic.articleId;
      const inserted = await ChunkModel.insertMany(
        texts.map((content: string) => ({
          userId,
          apiKeyId,
          ...(articleId ? { articleId } : {}),
          topicId,
          content,
        })),
      );

      const vectorSize = vectors[0]!.length;
      await ensureChunkCollection(vectorSize);
      await upsertChunkPoints(
        inserted.map((doc, index) => {
          const chunk = doc.toObject() as ChunkDoc;
          return {
            id: crypto.randomUUID(),
            vector: vectors[index]!,
            payload: {
              chunkId: chunk._id.toString(),
              topicId: topicId.toString(),
              ...(articleId ? { articleId: articleId.toString() } : {}),
              userId: userId.toString(),
              apiKeyId: apiKeyId.toString(),
              content: texts[index]!,
            },
          };
        }),
      );

      await TopicModel.updateOne(
        { _id: topicId },
        { $set: { isSynced: "synced" } },
      );
      syncedIds.push(topicId.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        `Topic sync failed (${topicId.toString()}): ${message}`,
        logSource,
        "chunkTopics",
      );
      await TopicModel.updateOne(
        { _id: topicId },
        { $set: { isSynced: "failed" } },
      );
    }

    if (onProgress) {
      await onProgress().catch(() => undefined);
    }
  }

  return syncedIds;
}

import { Types } from "mongoose";
import phash from "sharp-phash";
import distance from "sharp-phash/distance";
import { TopicModel } from "../models/topic/topic.model";
import {
  deleteFile,
  deleteFileIfExists,
  deleteAllFilesForApiKey,
  findFile,
  findOwnedFile,
  getBucket,
  openDownload,
  uploadFile,
  type GridFsFileResult,
} from "./gridfs";

const BUCKET = "article";

/** Hamming distance at or below this reuses an existing image. */
const PHASH_SIMILARITY_THRESHOLD = 5;

export type ArticleFileResult = GridFsFileResult;

export type UploadArticleFileOpts = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  metadata?: Record<string, unknown>;
};

export function getArticleBucket() {
  return getBucket(BUCKET);
}

async function computePhash(buffer: Buffer): Promise<string | null> {
  try {
    return await phash(buffer);
  } catch {
    return null;
  }
}

export async function findSimilarArticleFile(
  apiKeyId: Types.ObjectId,
  hash: string,
): Promise<ArticleFileResult | null> {
  const files = await getArticleBucket()
    .find({
      "metadata.apiKeyId": apiKeyId,
      "metadata.phash": { $exists: true, $type: "string" },
    })
    .toArray();

  let best: { id: Types.ObjectId; filename: string; dist: number } | null =
    null;

  for (const file of files) {
    const existing =
      typeof file.metadata?.phash === "string" ? file.metadata.phash : null;
    if (!existing) continue;

    const dist = distance(hash, existing);
    if (dist > PHASH_SIMILARITY_THRESHOLD) continue;
    if (!best || dist < best.dist) {
      best = {
        id: file._id as Types.ObjectId,
        filename: file.filename,
        dist,
      };
      if (dist === 0) break;
    }
  }

  return best ? { id: best.id, filename: best.filename } : null;
}

export async function uploadArticleFile(
  opts: UploadArticleFileOpts,
): Promise<ArticleFileResult> {
  const hash = await computePhash(opts.buffer);
  if (hash) {
    const similar = await findSimilarArticleFile(opts.apiKeyId, hash);
    if (similar) return similar;
  }

  return uploadFile(BUCKET, {
    buffer: opts.buffer,
    filename: opts.filename,
    contentType: opts.contentType,
    metadata: {
      ...opts.metadata,
      userId: opts.userId,
      apiKeyId: opts.apiKeyId,
      ...(hash ? { phash: hash } : {}),
    },
  });
}

export async function deleteArticleFile(
  id: string | Types.ObjectId,
): Promise<void> {
  await deleteFile(BUCKET, id);
}

export async function deleteArticleFileIfExists(
  id: string | Types.ObjectId,
): Promise<void> {
  await deleteFileIfExists(BUCKET, id);
}

export async function deleteAllArticleFilesForApiKey(
  apiKeyId: Types.ObjectId,
): Promise<void> {
  await deleteAllFilesForApiKey(BUCKET, apiKeyId);
}

export async function deleteArticleFileIfUnused(
  id: string | Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Promise<void> {
  const mediaId = id.toString();
  const mediaObjectId = new Types.ObjectId(mediaId);
  const stillReferenced = await TopicModel.exists({
    apiKeyId,
    $or: [
      {
        topicContent: {
          $elemMatch: {
            type: "image",
            mediaId: { $in: [mediaObjectId, mediaId] },
          },
        },
      },
      { topicContent: { $regex: `\\{\\{image id="${mediaId}"` } },
    ],
  });
  if (stillReferenced) return;
  await deleteArticleFileIfExists(id);
}

export function openArticleDownload(id: string | Types.ObjectId) {
  return openDownload(BUCKET, id);
}

export async function findArticleFile(id: string | Types.ObjectId) {
  return findFile(BUCKET, id);
}

export async function findOwnedArticleFile(
  id: string | Types.ObjectId,
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
) {
  return findOwnedFile(BUCKET, id, userId, apiKeyId);
}

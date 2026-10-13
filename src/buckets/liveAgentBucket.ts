import type { Types } from "mongoose";
import {
  deleteAllFilesForApiKey,
  deleteFileIfExists,
  findFile,
  findOwnedFile,
  openDownload,
  uploadFile,
  type GridFsFileResult,
  type UploadFileOpts,
} from "./gridfs";

const BUCKET = "liveAgent";

export type LiveAgentFileResult = GridFsFileResult;

export async function uploadLiveAgentFile(
  opts: UploadFileOpts,
): Promise<LiveAgentFileResult> {
  return uploadFile(BUCKET, opts);
}

export async function deleteLiveAgentFileIfExists(
  id: string | Types.ObjectId,
): Promise<void> {
  await deleteFileIfExists(BUCKET, id);
}

export async function deleteAllLiveAgentFilesForApiKey(
  apiKeyId: Types.ObjectId,
): Promise<void> {
  await deleteAllFilesForApiKey(BUCKET, apiKeyId);
}

export async function findLiveAgentFile(id: string | Types.ObjectId) {
  return findFile(BUCKET, id);
}

export async function findOwnedLiveAgentFile(
  id: string | Types.ObjectId,
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
) {
  return findOwnedFile(BUCKET, id, userId, apiKeyId);
}

export function openLiveAgentDownload(id: string | Types.ObjectId) {
  return openDownload(BUCKET, id);
}

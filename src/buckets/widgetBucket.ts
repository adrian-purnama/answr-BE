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

const BUCKET = "widget";

export type WidgetFileResult = GridFsFileResult;

export async function uploadWidgetFile(
  opts: UploadFileOpts,
): Promise<WidgetFileResult> {
  return uploadFile(BUCKET, opts);
}

export async function deleteWidgetFileIfExists(
  id: string | Types.ObjectId,
): Promise<void> {
  await deleteFileIfExists(BUCKET, id);
}

export async function deleteAllWidgetFilesForApiKey(
  apiKeyId: Types.ObjectId,
): Promise<void> {
  await deleteAllFilesForApiKey(BUCKET, apiKeyId);
}

export async function findWidgetFile(id: string | Types.ObjectId) {
  return findFile(BUCKET, id);
}

export async function findOwnedWidgetFile(
  id: string | Types.ObjectId,
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
) {
  return findOwnedFile(BUCKET, id, userId, apiKeyId);
}

export function openWidgetDownload(id: string | Types.ObjectId) {
  return openDownload(BUCKET, id);
}

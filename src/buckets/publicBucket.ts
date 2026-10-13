import mongoose, { Types, type ClientSession } from "mongoose";
import {
  deleteFileIfExists,
  uploadFile,
  findFile,
  openDownload,
  type GridFsFileResult,
  type UploadFileOpts,
} from "./gridfs";

const BUCKET = "public";

export type UpdatePublicFileOpts = UploadFileOpts & {
  oldId?: string | Types.ObjectId | null;
  onReplace: (newId: Types.ObjectId, session: ClientSession) => Promise<void>;
};

export async function updatePublicFile(
  opts: UpdatePublicFileOpts,
): Promise<GridFsFileResult> {
  const uploaded = await uploadFile(BUCKET, {
    buffer: opts.buffer,
    filename: opts.filename,
    contentType: opts.contentType,
    metadata: opts.metadata,
  });

  try {
    await mongoose.connection.transaction(async (session) => {
      await opts.onReplace(uploaded.id, session);
    });
  } catch (error) {
    await deleteFileIfExists(BUCKET, uploaded.id);
    throw error;
  }

  if (opts.oldId) {
    await deleteFileIfExists(BUCKET, opts.oldId);
  }

  return uploaded;
}

export async function findPublicFile(id: string | Types.ObjectId) {
  return findFile(BUCKET, id);
}

export function openPublicDownload(id: string | Types.ObjectId) {
  return openDownload(BUCKET, id);
}

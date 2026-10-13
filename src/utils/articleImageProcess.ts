import sharp from "sharp";
import { MAX_TOPIC_IMAGE_BYTES } from "../validation/topic";

/** Longest edge after resize (no upscaling). */
export const ARTICLE_IMAGE_MAX_EDGE = 1920;

export type ProcessedArticleImage = {
  buffer: Buffer;
  contentType: "image/webp";
  filename: string;
};

/**
 * Validate, resize, and compress an article image to WebP.
 * Shared by topic multipart uploads and media ingest.
 */
export async function processArticleImage(
  input: Buffer,
  _contentTypeHint?: string,
): Promise<ProcessedArticleImage> {
  if (!input.length) {
    throw new Error("Invalid image");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new Error("Only image uploads are allowed");
  }

  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error("Only image uploads are allowed");
  }

  let pipeline = sharp(input, { failOn: "error" });
  const longest = Math.max(metadata.width, metadata.height);
  if (longest > ARTICLE_IMAGE_MAX_EDGE) {
    pipeline = pipeline.resize({
      width: ARTICLE_IMAGE_MAX_EDGE,
      height: ARTICLE_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline.webp({ quality: 80, effort: 4 }).toBuffer();
  if (buffer.length > MAX_TOPIC_IMAGE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  return {
    buffer,
    contentType: "image/webp",
    filename: "image.webp",
  };
}

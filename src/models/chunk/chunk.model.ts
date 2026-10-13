import { model, Schema } from "mongoose";
import type { ChunkInterface } from "./chunk.interface";

const chunkSchema = new Schema<ChunkInterface>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "Article",
      required: false,
    },
    topicId: {
      type: Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    content: {
      type: String,
      required: true,
      default: "",
    }
  },
  { timestamps: true },
);

chunkSchema.index({ topicId: 1 });
chunkSchema.index({ userId: 1, apiKeyId: 1, articleId: 1 });
chunkSchema.index({ content: "text" });

export const ChunkModel = model<ChunkInterface>("Chunk", chunkSchema);

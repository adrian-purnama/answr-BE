import type { Types } from "mongoose";

export interface ChunkInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** Present for article topic chunks; omitted for snippet chunks. */
  articleId?: Types.ObjectId;
  topicId: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

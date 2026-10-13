import type { Types } from "mongoose";

export interface ArticleInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** Actor who created the article. Falls back to userId (workspace owner) when missing. */
  createdBy?: Types.ObjectId;
  /** Actor who last updated the article or one of its topics. */
  updatedBy?: Types.ObjectId;
  title: string;
  description: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

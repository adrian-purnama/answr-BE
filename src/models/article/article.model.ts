import { model, Schema } from "mongoose";
import type { ArticleInterface } from "./article.interface";

export const ARTICLE_TITLE_MAX = 200;
export const ARTICLE_DESCRIPTION_MAX = 500;

const articleSchema = new Schema<ArticleInterface>(
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
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: ARTICLE_TITLE_MAX,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: ARTICLE_DESCRIPTION_MAX,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

articleSchema.index({ userId: 1, apiKeyId: 1 });

export const ArticleModel = model<ArticleInterface>("Article", articleSchema);

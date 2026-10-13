import { model, Schema } from "mongoose";
import type { NewsInterface } from "./news.interface";

const newsCtaSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: false },
    text: { type: String, required: true, default: "" },
    url: { type: String, required: true, default: "" },
  },
  { _id: false },
);

const newsSchema = new Schema<NewsInterface>(
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    heroImage: {
      type: String,
      required: true,
      default: "",
    },
    content: {
      type: String,
      required: true,
      default: "",
    },
    cta: {
      type: newsCtaSchema,
      required: true,
      default: () => ({ enabled: false, text: "", url: "" }),
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

newsSchema.index({ userId: 1, apiKeyId: 1, createdAt: -1 });
newsSchema.index({ apiKeyId: 1, enabled: 1, createdAt: -1 });

export const NewsModel = model<NewsInterface>("News", newsSchema);

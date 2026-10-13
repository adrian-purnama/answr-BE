import { model, Schema } from "mongoose";
import type { TopicInterface } from "./topic.interface";
import { TOPIC_SYNC_VALUES, TOPIC_TYPE_VALUES } from "./topic.interface";

export const TOPIC_NAME_MAX = 200;

const topicSchema = new Schema<TopicInterface>(
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
    articleId: {
      type: Schema.Types.ObjectId,
      ref: "Article",
      required: false,
    },
    topicName: {
      type: String,
      required: true,
      trim: true,
      maxlength: TOPIC_NAME_MAX,
    },
    /** String with {{image}}/{{topic}}/{{tool}} tokens. */
    topicContent: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: TOPIC_TYPE_VALUES,
      required: true,
      default: "snippet",
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    isSynced: {
      type: String,
      required: true,
      enum: TOPIC_SYNC_VALUES,
      default: "not-synced",
    },
  },
  { timestamps: true },
);

topicSchema.index({ articleId: 1, order: 1 });
topicSchema.index({ userId: 1, apiKeyId: 1, articleId: 1 });
topicSchema.index({ userId: 1, apiKeyId: 1, type: 1 });

export const TopicModel = model<TopicInterface>("Topic", topicSchema);

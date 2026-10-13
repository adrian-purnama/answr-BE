import type { Types } from "mongoose";

export const TOPIC_TYPE_VALUES = ["content", "snippet"] as const;
export type TopicType = (typeof TOPIC_TYPE_VALUES)[number];

export const TOPIC_SYNC_VALUES = [
  "synced",
  "not-synced",
  "failed",
  "in-progress",
] as const;
export type TopicSyncStatus = (typeof TOPIC_SYNC_VALUES)[number];

export interface TopicInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  /** Present for content topics; omitted for standalone snippets. */
  articleId?: Types.ObjectId;
  topicName: string;
  topicContent: string;
  type: TopicType;
  order: number;
  enabled: boolean;
  createdAt: Date;
  isSynced: TopicSyncStatus;
  updatedAt: Date;
}

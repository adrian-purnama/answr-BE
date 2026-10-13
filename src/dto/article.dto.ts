export interface CreateArticleDto {
  apiKeyId: string;
  title: string;
  description?: string;
}

export interface UpdateArticleDto {
  title?: string;
  description?: string;
  enabled?: boolean;
}

export type ArticleSyncStatus = "synced" | "partial" | "not-synced";

export interface ArticleOutDto {
  id: string;
  apiKeyId: string;
  title: string;
  description: string;
  enabled: boolean;
  syncStatus: ArticleSyncStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ArticleDetailOutDto extends ArticleOutDto {
  topics: TopicOutDto[];
}

export interface ImportArticleDto {
  apiKeyId: string;
  /** Raw markdown string when importing .md without zip */
  markdown?: string;
}

export interface ExportArticleOutDto {
  filename: string;
  /** Base64-encoded zip containing article.md + images/ */
  zipBase64: string;
}

export interface TopicOutDto {
  id: string;
  articleId?: string;
  topicName: string;
  topicContent: string;
  type: "content" | "snippet";
  order: number;
  enabled: boolean;
  isSynced: "synced" | "not-synced" | "failed" | "in-progress";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Public embed article detail    no ownership fields. */
export interface PublicArticleTopicOutDto {
  id: string;
  topicName: string;
  enabled: boolean;
  topicContent: string;
}

export interface PublicArticleDetailOutDto {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  topics: PublicArticleTopicOutDto[];
}

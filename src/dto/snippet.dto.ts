export interface CreateSnippetDto {
  apiKeyId: string;
  topicName: string;
  topicContent?: string;
}

export interface UpdateSnippetDto {
  topicName?: string;
  topicContent?: string;
  enabled?: boolean;
  order?: number;
}

export interface SnippetOutDto {
  id: string;
  apiKeyId: string;
  topicName: string;
  topicContent: string;
  type: "snippet";
  order: number;
  enabled: boolean;
  isSynced: "synced" | "not-synced" | "failed" | "in-progress";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

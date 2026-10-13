export interface CreateTopicDto {
  topicName: string;
  topicContent?: string;
}

export interface UpdateTopicDto {
  topicName?: string;
  topicContent?: string;
  enabled?: boolean;
  order?: number;
}

export interface ReorderTopicsDto {
  topicIds: string[];
}

export interface CreateGuidanceDto {
  apiKeyId: string;
  title: string;
  content: string;
}

export interface UpdateGuidanceDto {
  title?: string;
  content?: string;
  enabled?: boolean;
}

export interface GuidanceOutDto {
  id: string;
  apiKeyId: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface GuidanceAgentItemDto {
  id: string;
  title: string;
  content: string;
}

export interface UiTemplateOutDto {
  id: string;
  apiKeyId: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUiTemplateDto {
  apiKeyId: string;
  name: string;
  description?: string;
  definition: Record<string, unknown>;
}

export interface UpdateUiTemplateDto {
  name?: string;
  description?: string;
  definition?: Record<string, unknown>;
}

export interface GenerateUiTemplateFromToolDto {
  apiKeyId: string;
  mcpId: string;
  toolId: string;
}

export interface GenerateUiTemplateFromToolOutDto {
  definition: Record<string, unknown>;
  suggestedName: string;
  binds: string[];
}

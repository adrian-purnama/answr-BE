import type {
  McpAuthType,
  McpStatus,
  McpTransport,
} from "../models/mcp/mcp.interface";

export type McpAuthPublicConfig = {
  headerName?: string;
  queryParam?: string;
  username?: string;
  clientId?: string;
  tokenUrl?: string;
  authorizeUrl?: string;
  scopes?: string[];
  hasHeaders?: boolean;
  hasQuery?: boolean;
  hasSecrets: boolean;
};

export type McpAuthenticationPublic = {
  type: McpAuthType;
  config: McpAuthPublicConfig;
};

export interface CreateMcpDto {
  apiKeyId: string;
  name: string;
  description?: string;
  serverUrl: string;
  transport?: McpTransport;
  authentication?: {
    type: McpAuthType;
    config?: Record<string, unknown>;
  };
}

export interface UpdateMcpDto {
  name?: string;
  description?: string;
  serverUrl?: string;
  transport?: McpTransport;
  authentication?: {
    type: McpAuthType;
    config?: Record<string, unknown>;
  };
  enabled?: boolean;
}

export interface UpdateMcpToolDto {
  enabled?: boolean;
  render?: "off" | "deterministic" | "auto";
  uiTemplateId?: string | null;
  fieldMap?: Record<string, string>;
}

export interface McpOutDto {
  id: string;
  apiKeyId: string;
  name: string;
  description: string;
  serverUrl: string;
  transport: McpTransport;
  authentication: McpAuthenticationPublic;
  enabled: boolean;
  status: McpStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolOutDto {
  id: string;
  apiKeyId: string;
  mcpId: string;
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations: Record<string, unknown> | null;
  enabled: boolean;
  render: "off" | "deterministic" | "auto";
  uiTemplateId: string | null;
  fieldMap: Record<string, string>;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpSyncResultDto {
  mcp: McpOutDto;
  tools: McpToolOutDto[];
}

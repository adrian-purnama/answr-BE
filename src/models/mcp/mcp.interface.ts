import type { Types } from "mongoose";

export const MCP_TRANSPORT_VALUES = ["streamable_http", "sse"] as const;
export type McpTransport = (typeof MCP_TRANSPORT_VALUES)[number];

export const MCP_AUTH_TYPE_VALUES = [
  "none",
  "bearer",
  "api_key",
  "basic",
  "oauth2",
  "custom",
] as const;
export type McpAuthType = (typeof MCP_AUTH_TYPE_VALUES)[number];

export const MCP_STATUS_VALUES = ["not_synced", "synced", "error"] as const;
export type McpStatus = (typeof MCP_STATUS_VALUES)[number];

export type McpAuthNoneConfig = Record<string, never>;

export type McpAuthBearerConfig = {
  token: string;
  headerName?: string;
};

export type McpAuthApiKeyConfig = {
  apiKey: string;
  headerName?: string;
  queryParam?: string;
};

export type McpAuthBasicConfig = {
  username: string;
  password: string;
};

export type McpAuthOAuth2Config = {
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
  authorizeUrl?: string;
  scopes?: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  extraHeaders?: Record<string, string>;
};

export type McpAuthCustomConfig = {
  headers?: Record<string, string>;
  query?: Record<string, string>;
};

export type McpAuthConfig =
  | McpAuthNoneConfig
  | McpAuthBearerConfig
  | McpAuthApiKeyConfig
  | McpAuthBasicConfig
  | McpAuthOAuth2Config
  | McpAuthCustomConfig;

export type McpAuthentication = {
  type: McpAuthType;
  config: McpAuthConfig;
};

export interface McpInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  name: string;
  description: string;
  serverUrl: string;
  transport: McpTransport;
  authentication: McpAuthentication;
  enabled: boolean;
  status: McpStatus;
  lastSyncedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

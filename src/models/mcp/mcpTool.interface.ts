import type { Types } from "mongoose";

export const MCP_TOOL_RENDER_VALUES = ["off", "deterministic", "auto"] as const;
export type McpToolRender = (typeof MCP_TOOL_RENDER_VALUES)[number];

export interface McpToolInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  mcpId: Types.ObjectId;
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  enabled: boolean;
  /** How tool results are shown in chat. Default off. */
  render: McpToolRender;
  /** UI template used when render is deterministic. */
  uiTemplateId?: Types.ObjectId | null;
  /** bindName -> dotted path in the tool JSON result. */
  fieldMap: Record<string, string>;
  raw?: Record<string, unknown>;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

import { model, Schema } from "mongoose";
import type { McpInterface } from "./mcp.interface";
import {
  MCP_AUTH_TYPE_VALUES,
  MCP_STATUS_VALUES,
  MCP_TRANSPORT_VALUES,
} from "./mcp.interface";

const mcpSchema = new Schema<McpInterface>(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    serverUrl: {
      type: String,
      required: true,
      trim: true,
    },
    transport: {
      type: String,
      enum: MCP_TRANSPORT_VALUES,
      default: "streamable_http",
      required: true,
    },
    authentication: {
      type: {
        type: String,
        enum: MCP_AUTH_TYPE_VALUES,
        default: "none",
        required: true,
      },
      config: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    status: {
      type: String,
      enum: MCP_STATUS_VALUES,
      default: "not_synced",
      required: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    lastError: {
      type: String,
    },
  },
  { timestamps: true },
);

mcpSchema.index({ userId: 1, apiKeyId: 1 });
mcpSchema.index({ apiKeyId: 1, name: 1 }, { unique: true });

export const MCPModel = model<McpInterface>("MCP", mcpSchema);

import { model, Schema } from "mongoose";
import type { McpToolInterface } from "./mcpTool.interface";
import { MCP_TOOL_RENDER_VALUES } from "./mcpTool.interface";

const mcpToolSchema = new Schema<McpToolInterface>(
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
    mcpId: {
      type: Schema.Types.ObjectId,
      ref: "MCP",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    inputSchema: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    outputSchema: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    annotations: {
      type: Schema.Types.Mixed,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    render: {
      type: String,
      enum: MCP_TOOL_RENDER_VALUES,
      required: true,
      default: "off",
    },
    uiTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "UiTemplate",
      default: null,
    },
    fieldMap: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    raw: {
      type: Schema.Types.Mixed,
    },
    lastSyncedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

mcpToolSchema.index({ mcpId: 1 });
mcpToolSchema.index({ mcpId: 1, name: 1 }, { unique: true });
mcpToolSchema.index({ userId: 1, apiKeyId: 1 });

export const McpToolModel = model<McpToolInterface>("McpTool", mcpToolSchema);

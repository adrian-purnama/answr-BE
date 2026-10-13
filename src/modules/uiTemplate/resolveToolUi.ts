import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import type { LlmChatConfig } from "../../llm/types";
import { McpToolModel } from "../../models/mcp/mcpTool.model";
import type { McpToolInterface } from "../../models/mcp/mcpTool.interface";
import { UiTemplateModel } from "../../models/uiTemplate/uiTemplate.model";
import type { UiTemplateInterface } from "../../models/uiTemplate/uiTemplate.interface";
import {
  collectBindNames,
  type UiRuntimeDesc,
  type UiTemplateDefinition,
} from "../../utils/uiDescSchema";
import { applyUiFieldMap } from "./applyUiFieldMap";
import { generateToolUiFromResult } from "./generateToolUi";

type McpToolDoc = McpToolInterface & { _id: Types.ObjectId };
type UiTemplateDoc = UiTemplateInterface & { _id: Types.ObjectId };

export type ToolUiBuildResult = {
  payload: UiRuntimeDesc;
  renderMode: "deterministic" | "auto";
};

async function buildDeterministicUi(
  tool: McpToolDoc,
  apiKeyId: Types.ObjectId,
  toolResult: unknown,
): Promise<UiRuntimeDesc | null> {
  if (!tool.uiTemplateId) {
    logger.warn(
      `MCP tool "${tool.name}" render=deterministic but uiTemplateId missing; skipping UI`,
      "modules/uiTemplate/resolveToolUi.ts",
      "buildDeterministicUi",
    );
    return null;
  }

  const template = await UiTemplateModel.findOne({
    _id: tool.uiTemplateId,
    apiKeyId,
  }).lean<UiTemplateDoc | null>();

  if (!template) {
    logger.warn(
      `MCP tool "${tool.name}" uiTemplateId not found; skipping UI`,
      "modules/uiTemplate/resolveToolUi.ts",
      "buildDeterministicUi",
    );
    return null;
  }

  const fieldMap = tool.fieldMap ?? {};
  const binds = collectBindNames(template.definition?.root);
  for (const key of Object.keys(fieldMap)) {
    if (!binds.has(key)) {
      logger.warn(
        `MCP tool "${tool.name}" fieldMap key "${key}" not present on template; ignored`,
        "modules/uiTemplate/resolveToolUi.ts",
        "buildDeterministicUi",
      );
    }
  }

  try {
    const payload = applyUiFieldMap(
      template.definition as unknown as UiTemplateDefinition,
      fieldMap,
      toolResult,
    );
    logger.info(
      `Rendered deterministic UI for MCP tool "${tool.name}" (template=${template.name})`,
      "modules/uiTemplate/resolveToolUi.ts",
      "buildDeterministicUi",
    );
    return payload;
  } catch (error) {
    logger.warn(
      `Failed to render UI for MCP tool "${tool.name}": ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "modules/uiTemplate/resolveToolUi.ts",
      "buildDeterministicUi",
    );
    return null;
  }
}

/**
 * Build chat UI for an MCP tool result based on render mode.
 * Returns null when off / invalid / generation failed.
 */
export async function tryBuildToolUi(options: {
  apiKeyId: Types.ObjectId;
  toolName: string;
  toolResult: unknown;
  isError: boolean;
  llmConfig?: LlmChatConfig;
  userId?: string;
}): Promise<ToolUiBuildResult | null> {
  if (options.isError) return null;

  const tool = await McpToolModel.findOne({
    apiKeyId: options.apiKeyId,
    name: options.toolName,
    enabled: true,
  }).lean<McpToolDoc | null>();

  if (!tool) return null;

  const render = tool.render ?? "off";
  if (render === "off") {
    return null;
  }

  if (render === "deterministic") {
    const payload = await buildDeterministicUi(
      tool,
      options.apiKeyId,
      options.toolResult,
    );
    return payload ? { payload, renderMode: "deterministic" } : null;
  }

  if (render === "auto") {
    if (!options.llmConfig) {
      logger.warn(
        `MCP tool "${tool.name}" render=auto but llmConfig missing; skipping UI`,
        "modules/uiTemplate/resolveToolUi.ts",
        "tryBuildToolUi",
      );
      return null;
    }
    const payload = await generateToolUiFromResult({
      toolName: tool.name,
      toolDescription: tool.description || tool.title,
      toolResult: options.toolResult,
      llmConfig: options.llmConfig,
      userId: options.userId,
    });
    return payload ? { payload, renderMode: "auto" } : null;
  }

  logger.warn(
    `MCP tool "${tool.name}" has unknown render="${String(render)}"; skipping UI`,
    "modules/uiTemplate/resolveToolUi.ts",
    "tryBuildToolUi",
  );
  return null;
}

/** @deprecated Use tryBuildToolUi */
export async function tryBuildDeterministicToolUi(options: {
  apiKeyId: Types.ObjectId;
  toolName: string;
  toolResult: unknown;
  isError: boolean;
}): Promise<UiRuntimeDesc | null> {
  const result = await tryBuildToolUi(options);
  return result?.payload ?? null;
}

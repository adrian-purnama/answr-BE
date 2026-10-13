import { Types } from "mongoose";
import type {
  CreateUiTemplateDto,
  GenerateUiTemplateFromToolDto,
  GenerateUiTemplateFromToolOutDto,
  UiTemplateOutDto,
  UpdateUiTemplateDto,
} from "../../dto/uiTemplate.dto";
import { UiTemplateModel } from "../../models/uiTemplate/uiTemplate.model";
import type { UiTemplateInterface } from "../../models/uiTemplate/uiTemplate.interface";
import { McpToolModel } from "../../models/mcp/mcpTool.model";
import type { McpToolInterface } from "../../models/mcp/mcpTool.interface";
import { BONSAI_CHAT_MODEL } from "../../llm/ollama/ollamaClient";
import type { LlmChatConfig } from "../../llm/types";
import { flattenJsonSchemaPaths } from "../../utils/jsonSchemaPaths";
import { generateUiTemplateFromOutputSchema } from "./generateToolUi";

type UiTemplateDoc = UiTemplateInterface & { _id: Types.ObjectId };
type McpToolDoc = McpToolInterface & { _id: Types.ObjectId };

/** Hard cap against unbounded UI template growth per project (api key). */
const MAX_UI_TEMPLATES_PER_API_KEY = 500;

/** Temperature defaults only; `chatWithQuota` picks DeepSeek vs Ollama. */
function llmConfigForUiGenerate(): LlmChatConfig {
  return {
    provider: "ollama",
    name: BONSAI_CHAT_MODEL,
    temperature: 0.2,
  };
}

function toOutDto(doc: UiTemplateDoc): UiTemplateOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    name: doc.name,
    description: doc.description ?? "",
    definition: (doc.definition ?? {}) as Record<string, unknown>,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class UiTemplateService {
  async list(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<UiTemplateOutDto[]> {
    const docs = await UiTemplateModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<UiTemplateDoc[]>();
    return docs.map(toOutDto);
  }

  async create(
    userId: Types.ObjectId,
    input: CreateUiTemplateDto,
  ): Promise<UiTemplateOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);

    const templateCount = await UiTemplateModel.countDocuments({ apiKeyId });
    if (templateCount >= MAX_UI_TEMPLATES_PER_API_KEY) {
      throw new Error(
        `UI template limit reached (max ${MAX_UI_TEMPLATES_PER_API_KEY} per project)`,
      );
    }

    try {
      const doc = await UiTemplateModel.create({
        userId,
        apiKeyId,
        name: input.name,
        description: input.description ?? "",
        definition: input.definition,
      });
      return toOutDto(doc.toObject() as UiTemplateDoc);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new Error("A UI template with this name already exists");
      }
      throw error;
    }
  }

  async getById(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<UiTemplateOutDto> {
    const doc = await this.findOwned(apiKeyId, id);
    return toOutDto(doc);
  }

  async update(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
    patch: UpdateUiTemplateDto,
  ): Promise<UiTemplateOutDto> {
    await this.findOwned(apiKeyId, id);
    const $set: Record<string, unknown> = {};
    if (patch.name !== undefined) $set.name = patch.name;
    if (patch.description !== undefined) $set.description = patch.description;
    if (patch.definition !== undefined) $set.definition = patch.definition;

    try {
      const doc = await UiTemplateModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), apiKeyId },
        { $set },
        { new: true },
      ).lean<UiTemplateDoc | null>();
      if (!doc) throw new Error("UI template not found");
      return toOutDto(doc);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new Error("A UI template with this name already exists");
      }
      throw error;
    }
  }

  async delete(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<void> {
    const result = await UiTemplateModel.deleteOne({
      _id: new Types.ObjectId(id),
      apiKeyId,
    });
    if (result.deletedCount === 0) {
      throw new Error("UI template not found");
    }
  }

  async generateFromTool(
    userId: Types.ObjectId,
    input: GenerateUiTemplateFromToolDto,
  ): Promise<GenerateUiTemplateFromToolOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);
    const mcpId = new Types.ObjectId(input.mcpId);
    const toolId = new Types.ObjectId(input.toolId);

    const tool = await McpToolModel.findOne({
      _id: toolId,
      apiKeyId,
      mcpId,
    }).lean<McpToolDoc | null>();

    if (!tool) {
      throw new Error("MCP tool not found");
    }

    const outputPaths = flattenJsonSchemaPaths(tool.outputSchema ?? {});
    if (outputPaths.length === 0) {
      throw new Error("Tool has no output schema fields to generate from");
    }

    const generated = await generateUiTemplateFromOutputSchema({
      toolName: tool.name,
      toolTitle: tool.title || tool.name,
      toolDescription: tool.description || "",
      outputPaths,
      llmConfig: llmConfigForUiGenerate(),
      userId: userId.toString(),
    });

    return {
      definition: generated.definition as unknown as Record<string, unknown>,
      suggestedName: generated.suggestedName,
      binds: generated.binds,
    };
  }

  private async findOwned(
    apiKeyId: Types.ObjectId,
    id: string,
  ): Promise<UiTemplateDoc> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("UI template not found");
    }
    const doc = await UiTemplateModel.findOne({
      _id: new Types.ObjectId(id),
      apiKeyId,
    }).lean<UiTemplateDoc | null>();
    if (!doc) throw new Error("UI template not found");
    return doc;
  }
}

export const uiTemplateService = new UiTemplateService();

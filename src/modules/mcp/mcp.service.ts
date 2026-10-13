import { Types } from "mongoose";
import type {
  CreateMcpDto,
  McpAuthenticationPublic,
  McpOutDto,
  McpSyncResultDto,
  McpToolOutDto,
  UpdateMcpDto,
  UpdateMcpToolDto,
} from "../../dto/mcp.dto";
import type {
  McpAuthApiKeyConfig,
  McpAuthBasicConfig,
  McpAuthBearerConfig,
  McpAuthCustomConfig,
  McpAuthOAuth2Config,
  McpAuthentication,
  McpInterface,
} from "../../models/mcp/mcp.interface";
import { MCPModel } from "../../models/mcp/mcp.model";
import type { McpToolInterface } from "../../models/mcp/mcpTool.interface";
import { McpToolModel } from "../../models/mcp/mcpTool.model";
import { UiTemplateModel } from "../../models/uiTemplate/uiTemplate.model";
import {
  callMcpTool,
  listMcpServerTools,
  type McpToolCallResult,
} from "../../utils/mcpClient";
import { parseAuthentication } from "../../validation/mcp";

type McpDoc = McpInterface & { _id: Types.ObjectId };
type McpToolDoc = McpToolInterface & { _id: Types.ObjectId };

/** Hard caps against unbounded MCP / tool growth per project (api key). */
const MAX_MCPS_PER_API_KEY = 50;
const MAX_TOOLS_PER_MCP = 200;

function hasSecretValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function toAuthPublic(
  authentication: McpAuthentication,
): McpAuthenticationPublic {
  const { type, config } = authentication;
  switch (type) {
    case "none":
      return { type, config: { hasSecrets: false } };
    case "bearer": {
      const c = config as McpAuthBearerConfig;
      return {
        type,
        config: {
          headerName: c.headerName,
          hasSecrets: hasSecretValue(c.token),
        },
      };
    }
    case "api_key": {
      const c = config as McpAuthApiKeyConfig;
      return {
        type,
        config: {
          headerName: c.headerName,
          queryParam: c.queryParam,
          hasSecrets: hasSecretValue(c.apiKey),
        },
      };
    }
    case "basic": {
      const c = config as McpAuthBasicConfig;
      return {
        type,
        config: {
          username: c.username,
          hasSecrets: hasSecretValue(c.password),
        },
      };
    }
    case "oauth2": {
      const c = config as McpAuthOAuth2Config;
      return {
        type,
        config: {
          clientId: c.clientId,
          tokenUrl: c.tokenUrl,
          authorizeUrl: c.authorizeUrl,
          scopes: c.scopes,
          hasSecrets:
            hasSecretValue(c.clientSecret) ||
            hasSecretValue(c.accessToken) ||
            hasSecretValue(c.refreshToken),
        },
      };
    }
    case "custom": {
      const c = config as McpAuthCustomConfig;
      return {
        type,
        config: {
          hasHeaders: Boolean(c.headers && Object.keys(c.headers).length > 0),
          hasQuery: Boolean(c.query && Object.keys(c.query).length > 0),
          hasSecrets: Boolean(
            c.headers &&
              Object.values(c.headers).some((v) => hasSecretValue(v)),
          ),
        },
      };
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported authentication type: ${_exhaustive}`);
    }
  }
}

function toMcpOutDto(doc: McpDoc): McpOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    name: doc.name,
    description: doc.description,
    serverUrl: doc.serverUrl,
    transport: doc.transport,
    authentication: toAuthPublic(doc.authentication),
    enabled: doc.enabled,
    status: doc.status,
    lastSyncedAt: doc.lastSyncedAt?.toISOString() ?? null,
    lastError: doc.lastError ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toMcpToolOutDto(doc: McpToolDoc): McpToolOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    mcpId: doc.mcpId.toString(),
    name: doc.name,
    title: doc.title?.trim() || doc.name,
    description: doc.description,
    inputSchema: doc.inputSchema ?? {},
    outputSchema: doc.outputSchema ?? {},
    annotations: doc.annotations ?? null,
    enabled: doc.enabled,
    render:
      doc.render === "deterministic"
        ? "deterministic"
        : doc.render === "auto"
          ? "auto"
          : "off",
    uiTemplateId: doc.uiTemplateId ? doc.uiTemplateId.toString() : null,
    fieldMap:
      doc.fieldMap && typeof doc.fieldMap === "object" ? { ...doc.fieldMap } : {},
    lastSyncedAt: doc.lastSyncedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function mergeAuthentication(
  existing: McpAuthentication,
  patch: { type: McpAuthentication["type"]; config?: Record<string, unknown> },
): McpAuthentication {
  const parsed = parseAuthentication(
    { type: patch.type, config: patch.config ?? {} },
    { requireSecrets: false },
  );

  if (parsed.type !== existing.type) {
    const full = parseAuthentication(
      { type: patch.type, config: patch.config ?? {} },
      { requireSecrets: true },
    );
    return full;
  }

  const mergedConfig: Record<string, unknown> = {
    ...(existing.config as Record<string, unknown>),
  };

  for (const [key, value] of Object.entries(
    parsed.config as Record<string, unknown>,
  )) {
    if (value !== undefined) {
      mergedConfig[key] = value;
    }
  }

  return parseAuthentication(
    { type: parsed.type, config: mergedConfig },
    { requireSecrets: true },
  );
}

export class McpService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<McpOutDto[]> {
    const docs = await MCPModel.find({ apiKeyId })
      .sort({ updatedAt: -1 })
      .lean<McpDoc[]>();
    return docs.map(toMcpOutDto);
  }

  async create(
    userId: Types.ObjectId,
    input: CreateMcpDto,
  ): Promise<McpOutDto> {
    const apiKeyId = new Types.ObjectId(input.apiKeyId);

    const mcpCount = await MCPModel.countDocuments({ apiKeyId });
    if (mcpCount >= MAX_MCPS_PER_API_KEY) {
      throw new Error(
        `MCP connection limit reached (max ${MAX_MCPS_PER_API_KEY} per project)`,
      );
    }

    const authentication = parseAuthentication(input.authentication, {
      requireSecrets: true,
    });

    try {
      const doc = await MCPModel.create({
        userId,
        apiKeyId,
        name: input.name,
        description: input.description ?? "",
        serverUrl: input.serverUrl,
        transport: input.transport ?? "streamable_http",
        authentication,
        enabled: true,
        status: "not_synced",
      });
      return toMcpOutDto(doc.toObject() as McpDoc);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new Error("An MCP connection with this name already exists");
      }
      throw error;
    }
  }

  async getById(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
  ): Promise<McpOutDto> {
    const doc = await this.findOwned(userId, apiKeyId, mcpId);
    return toMcpOutDto(doc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
    patch: UpdateMcpDto,
  ): Promise<McpOutDto> {
    const existing = await this.findOwned(userId, apiKeyId, mcpId);

    if (patch.name !== undefined) existing.name = patch.name;
    if (patch.description !== undefined) existing.description = patch.description;
    if (patch.serverUrl !== undefined) existing.serverUrl = patch.serverUrl;
    if (patch.transport !== undefined) existing.transport = patch.transport;
    if (patch.enabled !== undefined) existing.enabled = patch.enabled;
    if (patch.authentication) {
      existing.authentication = mergeAuthentication(
        existing.authentication,
        patch.authentication,
      );
    }

    try {
      await existing.save();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new Error("An MCP connection with this name already exists");
      }
      throw error;
    }

    return toMcpOutDto(existing.toObject() as McpDoc);
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
  ): Promise<void> {
    const existing = await this.findOwned(userId, apiKeyId, mcpId);
    await McpToolModel.deleteMany({
      apiKeyId,
      mcpId: existing._id,
    });
    await existing.deleteOne();
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await McpToolModel.deleteMany({ apiKeyId });
    await MCPModel.deleteMany({ apiKeyId });
  }

  async sync(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
  ): Promise<McpSyncResultDto> {
    const existing = await this.findOwned(userId, apiKeyId, mcpId);

    try {
      const listed = await listMcpServerTools({
        serverUrl: existing.serverUrl,
        transport: existing.transport,
        authentication: existing.authentication,
      });

      if (listed.length > MAX_TOOLS_PER_MCP) {
        throw new Error(
          `MCP tool limit reached (max ${MAX_TOOLS_PER_MCP} per connection; server advertised ${listed.length})`,
        );
      }

      const syncedAt = new Date();
      const keptNames = new Set(listed.map((tool) => tool.name));

      for (const tool of listed) {
        await McpToolModel.findOneAndUpdate(
          {
            apiKeyId,
            mcpId: existing._id,
            name: tool.name,
          },
          {
            $set: {
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
              annotations: tool.annotations,
              raw: tool.raw,
              lastSyncedAt: syncedAt,
            },
            $setOnInsert: {
              userId,
              apiKeyId,
              mcpId: existing._id,
              name: tool.name,
              enabled: true,
              render: "off",
              fieldMap: {},
            },
          },
          { upsert: true, new: true },
        );
      }

      if (keptNames.size > 0) {
        await McpToolModel.deleteMany({
          apiKeyId,
          mcpId: existing._id,
          name: { $nin: [...keptNames] },
        });
      } else {
        await McpToolModel.deleteMany({
          apiKeyId,
          mcpId: existing._id,
        });
      }

      existing.status = "synced";
      existing.lastSyncedAt = syncedAt;
      existing.lastError = undefined;
      await existing.save();

      const tools = await this.listTools(userId, apiKeyId, mcpId);
      return { mcp: toMcpOutDto(existing.toObject() as McpDoc), tools };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync MCP server";
      existing.status = "error";
      existing.lastError = message;
      await existing.save();
      throw new Error(message);
    }
  }

  async listTools(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
  ): Promise<McpToolOutDto[]> {
    const mcp = await this.findOwned(userId, apiKeyId, mcpId);
    const docs = await McpToolModel.find({
      apiKeyId,
      mcpId: mcp._id,
    })
      .sort({ name: 1 })
      .lean<McpToolDoc[]>();
    return docs.map(toMcpToolOutDto);
  }

  /** Flat list of tools where both the MCP connection and the tool are enabled. */
  async listEnabledTools(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<McpToolOutDto[]> {
    const mcps = await MCPModel.find({
      apiKeyId,
      enabled: true,
    })
      .select("_id")
      .lean<Array<{ _id: Types.ObjectId }>>();

    if (mcps.length === 0) return [];

    const mcpIds = mcps.map((mcp) => mcp._id);
    const docs = await McpToolModel.find({
      apiKeyId,
      mcpId: { $in: mcpIds },
      enabled: true,
    })
      .sort({ name: 1 })
      .lean<McpToolDoc[]>();

    return docs.map(toMcpToolOutDto);
  }

  /**
   * Resolve an enabled tool by name for this project and call the remote MCP server.
   * Prefer structuredContent when present; otherwise return content.
   */
  async callEnabledTool(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<{
    name: string;
    mcpId: string;
    result: unknown;
    isError: boolean;
    raw: McpToolCallResult;
  }> {
    const name = toolName.trim();
    if (!name) {
      throw new Error("MCP tool not found");
    }

    const enabled = await this.listEnabledTools(userId, apiKeyId);
    const matched = enabled.find(
      (row) => row.name.toLowerCase() === name.toLowerCase(),
    );
    if (!matched) {
      throw new Error("MCP tool not found");
    }

    const tool = await McpToolModel.findOne({
      apiKeyId,
      name: matched.name,
      enabled: true,
    }).lean<McpToolDoc | null>();

    if (!tool) {
      throw new Error("MCP tool not found");
    }

    const mcp = await MCPModel.findOne({
      _id: tool.mcpId,
      apiKeyId,
      enabled: true,
    }).lean<McpDoc | null>();

    if (!mcp) {
      throw new Error("MCP tool not found");
    }

    const raw = await callMcpTool({
      serverUrl: mcp.serverUrl,
      transport: mcp.transport,
      authentication: mcp.authentication,
      name: tool.name,
      arguments: args,
    });

    const result =
      raw.structuredContent !== undefined && raw.structuredContent !== null
        ? raw.structuredContent
        : raw.content;

    return {
      name: tool.name,
      mcpId: mcp._id.toString(),
      result,
      isError: raw.isError,
      raw,
    };
  }

  async updateTool(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
    toolId: string,
    patch: UpdateMcpToolDto,
  ): Promise<McpToolOutDto> {
    await this.findOwned(userId, apiKeyId, mcpId);
    if (!Types.ObjectId.isValid(toolId)) {
      throw new Error("MCP tool not found");
    }

    const $set: Record<string, unknown> = {};
    if (patch.enabled !== undefined) $set.enabled = patch.enabled;
    if (patch.render !== undefined) $set.render = patch.render;
    if (patch.fieldMap !== undefined) $set.fieldMap = patch.fieldMap;
    if (patch.uiTemplateId !== undefined) {
      $set.uiTemplateId =
        patch.uiTemplateId === null
          ? null
          : new Types.ObjectId(patch.uiTemplateId);
    }

    if (patch.render === "deterministic") {
      const existing = await McpToolModel.findOne({
        _id: new Types.ObjectId(toolId),
        apiKeyId,
        mcpId: new Types.ObjectId(mcpId),
      }).lean<McpToolDoc | null>();
      if (!existing) throw new Error("MCP tool not found");
      const templateId =
        patch.uiTemplateId !== undefined
          ? patch.uiTemplateId
          : existing.uiTemplateId
            ? existing.uiTemplateId.toString()
            : null;
      if (!templateId) {
        throw new Error("uiTemplateId is required when render is deterministic");
      }
      const template = await UiTemplateModel.findOne({
        _id: new Types.ObjectId(templateId),
        apiKeyId,
      }).lean();
      if (!template) {
        throw new Error("UI template not found");
      }
    } else if (patch.uiTemplateId) {
      const template = await UiTemplateModel.findOne({
        _id: new Types.ObjectId(patch.uiTemplateId),
        apiKeyId,
      }).lean();
      if (!template) {
        throw new Error("UI template not found");
      }
    }

    const doc = await McpToolModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(toolId),
        apiKeyId,
        mcpId: new Types.ObjectId(mcpId),
      },
      { $set },
      { new: true },
    ).lean<McpToolDoc | null>();

    if (!doc) {
      throw new Error("MCP tool not found");
    }
    return toMcpToolOutDto(doc);
  }

  private async findOwned(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mcpId: string,
  ) {
    if (!Types.ObjectId.isValid(mcpId)) {
      throw new Error("MCP not found");
    }
    const doc = await MCPModel.findOne({
      _id: new Types.ObjectId(mcpId),
      apiKeyId,
    });
    if (!doc) {
      throw new Error("MCP not found");
    }
    return doc;
  }
}

export const mcpService = new McpService();

import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  McpOutDto,
  McpSyncResultDto,
  McpToolOutDto,
} from "../../dto/mcp.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseCreateMcpDto,
  parseMcpRouteId,
  parseMcpToolRouteId,
  parseUpdateMcpDto,
  parseUpdateMcpToolDto,
} from "../../validation/mcp";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { mcpService } from "./mcp.service";

export class McpController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const data = await mcpService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "MCP connections retrieved",
        data,
      } satisfies ApiResponseDto<McpOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list MCP connections";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const input = parseCreateMcpDto(req.body);
      const data = await mcpService.create(userId, input);
      return res.status(201).json({
        success: true,
        message: "MCP connection created",
        data,
      } satisfies ApiResponseDto<McpOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create MCP connection";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getById = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      const data = await mcpService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "MCP connection retrieved",
        data,
      } satisfies ApiResponseDto<McpOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get MCP connection";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      const patch = parseUpdateMcpDto(req.body);
      const data = await mcpService.update(userId, apiKeyId, id, patch);
      return res.status(200).json({
        success: true,
        message: "MCP connection updated",
        data,
      } satisfies ApiResponseDto<McpOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update MCP connection";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      await mcpService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "MCP connection deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete MCP connection";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  sync = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      const data = await mcpService.sync(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "MCP connection synced",
        data,
      } satisfies ApiResponseDto<McpSyncResultDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to sync MCP connection";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listEnabledTools = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const data = await mcpService.listEnabledTools(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Enabled MCP tools retrieved",
        data,
      } satisfies ApiResponseDto<McpToolOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list enabled MCP tools";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listTools = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      const data = await mcpService.listTools(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "MCP tools retrieved",
        data,
      } satisfies ApiResponseDto<McpToolOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list MCP tools";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateTool = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const id = parseMcpRouteId(req.params.id);
      const toolId = parseMcpToolRouteId(req.params.toolId);
      const patch = parseUpdateMcpToolDto(req.body);
      const data = await mcpService.updateTool(
        userId,
        apiKeyId,
        id,
        toolId,
        patch,
      );
      return res.status(200).json({
        success: true,
        message: "MCP tool updated",
        data,
      } satisfies ApiResponseDto<McpToolOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update MCP tool";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

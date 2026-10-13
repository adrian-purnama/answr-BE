import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { SnippetOutDto } from "../../dto/snippet.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseCreateSnippetDto,
  parseForceQuery,
  parseSnippetRouteId,
  parseUpdateSnippetDto,
} from "../../validation/snippet";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { snippetService } from "./snippet.service";

export class SnippetController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await snippetService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Snippets retrieved",
        data,
      } satisfies ApiResponseDto<SnippetOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list snippets";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const input = parseCreateSnippetDto(req.body);
      const data = await snippetService.create(userId, input, actorId);
      return res.status(201).json({
        success: true,
        message: "Snippet created",
        data,
      } satisfies ApiResponseDto<SnippetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create snippet";
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

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseSnippetRouteId(req.params.id);
      const data = await snippetService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Snippet retrieved",
        data,
      } satisfies ApiResponseDto<SnippetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get snippet";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const id = parseSnippetRouteId(req.params.id);
      const patch = parseUpdateSnippetDto(req.body);
      const files = Array.isArray(req.files) ? req.files : [];
      const data = await snippetService.update(
        userId,
        apiKeyId,
        id,
        patch,
        files,
        actorId,
      );
      return res.status(200).json({
        success: true,
        message: "Snippet updated",
        data,
      } satisfies ApiResponseDto<SnippetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update snippet";
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

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseSnippetRouteId(req.params.id);
      await snippetService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Snippet deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete snippet";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  resync = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const force = parseForceQuery(req.query.force);
      const data = await snippetService.resync(userId, apiKeyId, force);
      return res.status(200).json({
        success: true,
        message: "Snippets resynced",
        data,
      } satisfies ApiResponseDto<string[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resync snippets";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

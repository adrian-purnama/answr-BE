import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  GenerateUiTemplateFromToolOutDto,
  UiTemplateOutDto,
} from "../../dto/uiTemplate.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import { statusForMessage } from "../../validation/http";
import {
  parseCreateUiTemplateDto,
  parseGenerateUiTemplateFromToolDto,
  parseUiTemplateRouteId,
  parseUpdateUiTemplateDto,
} from "../../validation/uiTemplate";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { uiTemplateService } from "./uiTemplate.service";

export class UiTemplateController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const data = await uiTemplateService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "UI templates retrieved",
        data,
      } satisfies ApiResponseDto<UiTemplateOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list UI templates";
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
      const input = parseCreateUiTemplateDto(req.body);
      const data = await uiTemplateService.create(userId, input);
      return res.status(201).json({
        success: true,
        message: "UI template created",
        data,
      } satisfies ApiResponseDto<UiTemplateOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create UI template";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  generateFromTool = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const input = parseGenerateUiTemplateFromToolDto(req.body);
      const data = await uiTemplateService.generateFromTool(userId, input);
      return res.status(200).json({
        success: true,
        message: "UI template generated",
        data,
      } satisfies ApiResponseDto<GenerateUiTemplateFromToolOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate UI template";
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
      const id = parseUiTemplateRouteId(req.params.id);
      const data = await uiTemplateService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "UI template retrieved",
        data,
      } satisfies ApiResponseDto<UiTemplateOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get UI template";
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
      const id = parseUiTemplateRouteId(req.params.id);
      const patch = parseUpdateUiTemplateDto(req.body);
      const data = await uiTemplateService.update(userId, apiKeyId, id, patch);
      return res.status(200).json({
        success: true,
        message: "UI template updated",
        data,
      } satisfies ApiResponseDto<UiTemplateOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update UI template";
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
      const id = parseUiTemplateRouteId(req.params.id);
      await uiTemplateService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "UI template deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete UI template";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

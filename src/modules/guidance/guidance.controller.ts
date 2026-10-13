import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { GuidanceOutDto } from "../../dto/guidance.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseCreateGuidanceDto,
  parseGuidanceRouteId,
  parseUpdateGuidanceDto,
} from "../../validation/guidance";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { guidanceService } from "./guidance.service";

export class GuidanceController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await guidanceService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Guidances retrieved",
        data,
      } satisfies ApiResponseDto<GuidanceOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list guidances";
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

      const input = parseCreateGuidanceDto(req.body);
      const data = await guidanceService.create(userId, input, actorId);
      return res.status(201).json({
        success: true,
        message: "Guidance created",
        data,
      } satisfies ApiResponseDto<GuidanceOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create guidance";
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
      const id = parseGuidanceRouteId(req.params.id);
      const data = await guidanceService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Guidance retrieved",
        data,
      } satisfies ApiResponseDto<GuidanceOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get guidance";
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

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseGuidanceRouteId(req.params.id);
      const patch = parseUpdateGuidanceDto(req.body);
      const data = await guidanceService.update(
        userId,
        apiKeyId,
        id,
        patch,
        actorId,
      );
      return res.status(200).json({
        success: true,
        message: "Guidance updated",
        data,
      } satisfies ApiResponseDto<GuidanceOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update guidance";
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
      const id = parseGuidanceRouteId(req.params.id);
      await guidanceService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Guidance deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete guidance";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

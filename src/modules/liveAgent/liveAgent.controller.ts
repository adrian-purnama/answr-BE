import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  LiveAgentLoginOutDto,
  LiveAgentMeOutDto,
  LiveAgentMediaOutDto,
  LiveAgentOutDto,
  LiveAgentSettingsOutDto,
} from "../../dto/liveAgent.dto";
import { parseApiKeyId, parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseCreateLiveAgentDto,
  parseLiveAgentLoginDto,
  parseLiveAgentMediaId,
  parseLiveAgentRouteId,
  parseResetLiveAgentPasswordDto,
  parseUpdateLiveAgentDto,
  parseUpdateLiveAgentSettingsDto,
} from "../../validation/liveAgent";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { liveAgentService } from "./liveAgent.service";

function multerFile(req: Request): Express.Multer.File | undefined {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  return file;
}

export class LiveAgentController {
  login = async (req: Request, res: Response) => {
    try {
      const input = parseLiveAgentLoginDto(req.body);
      const data = await liveAgentService.login(input);
      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        data,
      } satisfies ApiResponseDto<LiveAgentLoginOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to login";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  me = async (req: Request, res: Response) => {
    try {
      if (!req.liveAgent) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }
      const data = await liveAgentService.me(req.liveAgent._id);
      return res.status(200).json({
        success: true,
        message: "Live agent session valid",
        data,
      } satisfies ApiResponseDto<LiveAgentMeOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to validate session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getSettings = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await liveAgentService.getSettings(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Live agent settings retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentSettingsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get live agent settings";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const patch = parseUpdateLiveAgentSettingsDto(req.body);
      const data = await liveAgentService.updateSettings(userId, apiKeyId, patch);
      return res.status(200).json({
        success: true,
        message: "Live agent settings updated",
        data,
      } satisfies ApiResponseDto<LiveAgentSettingsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update live agent settings";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await liveAgentService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Live agents retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list live agents";
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

      const input = parseCreateLiveAgentDto(req.body);
      const data = await liveAgentService.create(userId, input);
      return res.status(201).json({
        success: true,
        message: "Live agent created",
        data,
      } satisfies ApiResponseDto<LiveAgentOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create live agent";
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
      const id = parseLiveAgentRouteId(req.params.id);
      const data = await liveAgentService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Live agent retrieved",
        data,
      } satisfies ApiResponseDto<LiveAgentOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get live agent";
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

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseLiveAgentRouteId(req.params.id);
      const patch = parseUpdateLiveAgentDto(req.body);
      const data = await liveAgentService.update(userId, apiKeyId, id, patch);
      return res.status(200).json({
        success: true,
        message: "Live agent updated",
        data,
      } satisfies ApiResponseDto<LiveAgentOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update live agent";
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
      const id = parseLiveAgentRouteId(req.params.id);
      await liveAgentService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Live agent deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete live agent";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseLiveAgentRouteId(req.params.id);
      const input = parseResetLiveAgentPasswordDto(req.body);
      await liveAgentService.resetPassword(userId, apiKeyId, id, input);
      return res.status(200).json({
        success: true,
        message: "Password reset",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to reset live agent password";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  uploadAvatar = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const id = parseLiveAgentRouteId(req.params.id);
      const file = multerFile(req);
      if (!file) {
        throw new Error("file is required");
      }

      const data = await liveAgentService.uploadAvatar(
        userId,
        apiKeyId,
        id,
        file,
      );
      return res.status(200).json({
        success: true,
        message: "Avatar uploaded",
        data,
      } satisfies ApiResponseDto<LiveAgentMediaOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload avatar";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getOwnedMedia = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const mediaId = parseLiveAgentMediaId(req.params.mediaId);
      await liveAgentService.streamOwnedMedia(userId, apiKeyId, mediaId, res);
    } catch (error) {
      if (res.headersSent) {
        next(error);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Failed to get media";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

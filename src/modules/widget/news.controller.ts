import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  NewsMediaOutDto,
  NewsOutDto,
  PublicNewsDetailOutDto,
  PublicNewsListItemOutDto,
} from "../../dto/news.dto";
import { parseApiKeyId } from "../../validation/apiKey";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import {
  parseCreateNewsDto,
  parseNewsId,
  parseNewsLimitQuery,
  parseUpdateNewsDto,
} from "../../validation/news";
import { clientIp } from "../../utils/clientIp";
import { newsService } from "./news.service";

function parsePublicKey(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Widget not found");
  }
  return value.trim();
}

function multerFile(req: Request): Express.Multer.File | undefined {
  return (req as Request & { file?: Express.Multer.File }).file;
}

export class NewsController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const data = await newsService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "News retrieved",
        data,
      } satisfies ApiResponseDto<NewsOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list news";
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

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const input = parseCreateNewsDto(req.body);
      const data = await newsService.create(userId, apiKeyId, input);
      return res.status(201).json({
        success: true,
        message: "News created",
        data,
      } satisfies ApiResponseDto<NewsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create news";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  get = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const newsId = parseNewsId(req.params.id);
      const data = await newsService.get(userId, apiKeyId, newsId);
      return res.status(200).json({
        success: true,
        message: "News retrieved",
        data,
      } satisfies ApiResponseDto<NewsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get news";
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

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const newsId = parseNewsId(req.params.id);
      const patch = parseUpdateNewsDto(req.body);
      const data = await newsService.update(userId, apiKeyId, newsId, patch);
      return res.status(200).json({
        success: true,
        message: "News updated",
        data,
      } satisfies ApiResponseDto<NewsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update news";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const newsId = parseNewsId(req.params.id);
      await newsService.delete(userId, apiKeyId, newsId);
      return res.status(200).json({
        success: true,
        message: "News deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete news";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  uploadMedia = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const data = await newsService.uploadMedia(
        userId,
        apiKeyId,
        multerFile(req),
      );
      return res.status(201).json({
        success: true,
        message: "Media uploaded",
        data,
      } satisfies ApiResponseDto<NewsMediaOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload media";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listPublic = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const limit = parseNewsLimitQuery(req.query.limit);
      const data = await newsService.listPublic(publicKey, limit);
      return res.status(200).json({
        success: true,
        message: "News retrieved",
        data,
      } satisfies ApiResponseDto<PublicNewsListItemOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list news";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getPublic = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const newsId = parseNewsId(req.params.id);
      const data = await newsService.getPublic(
        publicKey,
        newsId,
        clientIp(req),
      );
      return res.status(200).json({
        success: true,
        message: "News retrieved",
        data,
      } satisfies ApiResponseDto<PublicNewsDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get news";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

export const newsController = new NewsController();

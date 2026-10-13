import type { NextFunction, Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  ChatSessionOutDto,
  PublicArticleDetailOutDto,
  PublicChatMessagesOutDto,
  PublicFaqContentOutDto,
  PublicWidgetOutDto,
  WidgetMediaOutDto,
  WidgetOutDto,
} from "../../dto/widget.dto";
import { parseApiKeyId } from "../../validation/apiKey";
import {
  parseBindVisitorIdentityDto,
  parseCreatePublicChatSessionDto,
  parseUpdateWidgetDto,
} from "../../validation/widget";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { clientIp } from "../../utils/clientIp";
import { widgetService } from "./widget.service";

function parsePublicKeyParam(
  param: string | string[] | undefined,
): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public key");
  }
  return value.trim();
}

function parseMediaIdParam(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Media not found");
  }
  return value.trim();
}

function parseArticleIdParam(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Article not found");
  }
  return value.trim();
}

function parseSessionIdParam(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Chat session not found");
  }
  return value.trim();
}

function multerFile(req: Request): Express.Multer.File | undefined {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  return file;
}

export class WidgetController {
  getByPublicKey = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const data = await widgetService.getByPublicKey(publicKey);

      return res.status(200).json({
        success: true,
        message: "Widget retrieved",
        data,
      } satisfies ApiResponseDto<PublicWidgetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get widget";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getFaqContent = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const data = await widgetService.getFaqContent(publicKey);

      return res.status(200).json({
        success: true,
        message: "FAQ content retrieved",
        data,
      } satisfies ApiResponseDto<PublicFaqContentOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get FAQ content";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getPublicArticle = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const articleId = parseArticleIdParam(req.params.articleId);
      const data = await widgetService.getPublicArticle(
        publicKey,
        articleId,
        clientIp(req),
      );

      return res.status(200).json({
        success: true,
        message: "Article retrieved",
        data,
      } satisfies ApiResponseDto<PublicArticleDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getOrCreate = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const data = await widgetService.getOrCreate(userId, apiKeyId);

      return res.status(200).json({
        success: true,
        message: "Widget retrieved",
        data,
      } satisfies ApiResponseDto<WidgetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get widget";
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
      const patch = parseUpdateWidgetDto(req.body);
      const data = await widgetService.update(userId, apiKeyId, patch);

      return res.status(200).json({
        success: true,
        message: "Widget updated",
        data,
      } satisfies ApiResponseDto<WidgetOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update widget";
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
      const data = await widgetService.uploadHomeMedia(
        userId,
        apiKeyId,
        req.query.type,
        multerFile(req),
      );

      return res.status(201).json({
        success: true,
        message: "Media uploaded",
        data,
      } satisfies ApiResponseDto<WidgetMediaOutDto>);
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

  getOwnedMedia = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const mediaId = parseMediaIdParam(req.params.mediaId);
      await widgetService.streamOwnedMedia(userId, apiKeyId, mediaId, res);
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

  getPublicMedia = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const mediaId = parseMediaIdParam(req.params.mediaId);
      await widgetService.streamPublicMedia(publicKey, mediaId, res);
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

  getPublicArticleMedia = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const mediaId = parseMediaIdParam(req.params.mediaId);
      await widgetService.streamPublicArticleMedia(publicKey, mediaId, res);
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

  getPublicLiveAgentMedia = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const mediaId = parseMediaIdParam(req.params.mediaId);
      await widgetService.streamPublicLiveAgentMedia(publicKey, mediaId, res);
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

  createChatSession = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const body = parseCreatePublicChatSessionDto(req.body);
      const data = await widgetService.createChatSession(publicKey, body);

      return res.status(201).json({
        success: true,
        message: "Chat session created",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  bindVisitorIdentity = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const { visitorToken } = parseBindVisitorIdentityDto(req.body);
      const data = await widgetService.bindVisitorIdentity(
        publicKey,
        sessionId,
        visitorToken,
      );

      return res.status(200).json({
        success: true,
        message: "Visitor identity bound",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to bind visitor identity";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getChatSession = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const data = await widgetService.getChatSession(publicKey, sessionId);

      return res.status(200).json({
        success: true,
        message: "Chat session retrieved",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listPublicChatMessages = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const data = await widgetService.listPublicChatMessages(
        publicKey,
        sessionId,
      );

      return res.status(200).json({
        success: true,
        message: "Chat messages retrieved",
        data,
      } satisfies ApiResponseDto<PublicChatMessagesOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get chat messages";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteChatSession = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      await widgetService.deleteChatSession(publicKey, sessionId);

      return res.status(200).json({
        success: true,
        message: "Chat session deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createOwnedChatSession = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const data = await widgetService.createOwnedChatSession(userId, apiKeyId);

      return res.status(201).json({
        success: true,
        message: "Chat session created",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  bindOwnedVisitorIdentity = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const { visitorToken } = parseBindVisitorIdentityDto(req.body);
      const data = await widgetService.bindOwnedVisitorIdentity(
        userId,
        apiKeyId,
        sessionId,
        visitorToken,
      );

      return res.status(200).json({
        success: true,
        message: "Visitor identity bound",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to bind visitor identity";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getOwnedChatSession = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const data = await widgetService.getOwnedChatSession(
        userId,
        apiKeyId,
        sessionId,
      );

      return res.status(200).json({
        success: true,
        message: "Chat session retrieved",
        data,
      } satisfies ApiResponseDto<ChatSessionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteOwnedChatSession = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      await widgetService.deleteOwnedChatSession(userId, apiKeyId, sessionId);

      return res.status(200).json({
        success: true,
        message: "Chat session deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete chat session";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

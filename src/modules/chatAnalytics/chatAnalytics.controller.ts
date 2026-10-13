import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  AnalyticsCategoryOutDto,
  ChatAnalyticsConversationOutDto,
  ChatAnalyticsRecordOutDto,
  ChatAnalyticsRecordsPageOutDto,
  ChatAnalyticsSummaryOutDto,
  ChatAnalyticsTrendsOutDto,
} from "../../dto/chatAnalytics.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseAnalyticsRecordsQuery,
  parseAnalyticsRouteId,
  parseAnalyticsSummaryQuery,
  parseAnalyticsTrendsQuery,
  parseAnalyticsOptionDimension,
  parseCategoryRouteId,
  parseCreateAnalyticsCategoryDto,
  parseUpdateAnalyticsCategoryDto,
} from "../../validation/chatAnalytics";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { chatAnalyticsService } from "./chatAnalytics.service";

export class ChatAnalyticsController {
  getSummary = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const query = parseAnalyticsSummaryQuery(req.query);
      const data = await chatAnalyticsService.getSummary(
        userId,
        query.apiKeyId,
        query.from,
        query.to,
      );
      return res.status(200).json({
        success: true,
        message: "Analytics summary retrieved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsSummaryOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get analytics summary";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getTrends = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const query = parseAnalyticsTrendsQuery(req.query);
      const data = await chatAnalyticsService.getTrends(
        userId,
        query.apiKeyId,
        {
          from: query.from,
          to: query.to,
          dimension: query.dimension,
          limit: query.limit,
        },
      );
      return res.status(200).json({
        success: true,
        message: "Analytics trends retrieved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsTrendsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get analytics trends";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listRecords = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const query = parseAnalyticsRecordsQuery(req.query);
      const data = await chatAnalyticsService.listRecords(userId, query);
      return res.status(200).json({
        success: true,
        message: "Analytics records retrieved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsRecordsPageOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list analytics records";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getRecord = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseAnalyticsRouteId(req.params.id);
      const data = await chatAnalyticsService.getRecord(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Analytics record retrieved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsRecordOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get analytics record";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  resolveGap = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseAnalyticsRouteId(req.params.id);
      const data = await chatAnalyticsService.resolveGap(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Gap resolved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsRecordOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resolve gap";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getConversation = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const sessionId = parseAnalyticsRouteId(req.params.sessionId);
      const data = await chatAnalyticsService.getConversation(
        userId,
        apiKeyId,
        sessionId,
      );
      return res.status(200).json({
        success: true,
        message: "Conversation retrieved",
        data,
      } satisfies ApiResponseDto<ChatAnalyticsConversationOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get conversation";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listCategories = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const dimension = parseAnalyticsOptionDimension(req.query.dimension);
      const data = await chatAnalyticsService.listCategories(
        userId,
        apiKeyId,
        dimension,
      );
      return res.status(200).json({
        success: true,
        message: "Analytics categories retrieved",
        data,
      } satisfies ApiResponseDto<AnalyticsCategoryOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list analytics categories";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createCategory = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const input = parseCreateAnalyticsCategoryDto(req.body);
      const data = await chatAnalyticsService.createCategory(userId, input);
      return res.status(201).json({
        success: true,
        message: "Analytics category created",
        data,
      } satisfies ApiResponseDto<AnalyticsCategoryOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create analytics category";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateCategory = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseCategoryRouteId(req.params.id);
      const patch = parseUpdateAnalyticsCategoryDto(req.body);
      const data = await chatAnalyticsService.updateCategory(
        userId,
        apiKeyId,
        id,
        patch,
      );
      return res.status(200).json({
        success: true,
        message: "Analytics category updated",
        data,
      } satisfies ApiResponseDto<AnalyticsCategoryOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update analytics category";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteCategory = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseCategoryRouteId(req.params.id);
      await chatAnalyticsService.deleteCategory(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Analytics category deactivated",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete analytics category";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

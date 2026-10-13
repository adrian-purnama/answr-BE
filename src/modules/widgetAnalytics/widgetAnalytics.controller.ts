import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  WidgetAiFeedbackOutDto,
  WidgetAnalyticsSummaryOutDto,
  WidgetVisitOutDto,
} from "../../dto/widgetAnalytics.dto";
import { clientIp } from "../../utils/clientIp";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import {
  parseSubmitWidgetAiFeedbackDto,
  parseWidgetAnalyticsSummaryQuery,
} from "../../validation/widgetAnalytics";
import { widgetAnalyticsService } from "./widgetAnalytics.service";

function parsePublicKeyParam(
  param: string | string[] | undefined,
): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public key");
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

export class WidgetAnalyticsController {
  recordPublicVisit = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const data = await widgetAnalyticsService.recordVisit(
        publicKey,
        clientIp(req),
      );
      return res.status(200).json({
        success: true,
        message: data.counted ? "Visit recorded" : "Visit already counted",
        data,
      } satisfies ApiResponseDto<WidgetVisitOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to record visit";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  submitPublicAiFeedback = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const sessionId = parseSessionIdParam(req.params.sessionId);
      const input = parseSubmitWidgetAiFeedbackDto(req.body);
      const data = await widgetAnalyticsService.submitAiFeedback(
        publicKey,
        sessionId,
        input,
      );
      return res.status(201).json({
        success: true,
        message: "Rating submitted",
        data,
      } satisfies ApiResponseDto<WidgetAiFeedbackOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit rating";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getSummary = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const query = parseWidgetAnalyticsSummaryQuery(req.query);
      const data = await widgetAnalyticsService.getSummary(
        userId,
        query.apiKeyId,
        query.from,
        query.to,
      );
      return res.status(200).json({
        success: true,
        message: "Widget analytics summary retrieved",
        data,
      } satisfies ApiResponseDto<WidgetAnalyticsSummaryOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get widget analytics summary";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

export const widgetAnalyticsController = new WidgetAnalyticsController();

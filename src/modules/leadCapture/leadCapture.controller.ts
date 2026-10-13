import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  LeadCaptureSettingsOutDto,
  LeadExportOutDto,
  LeadMessageOutDto,
  LeadOutDto,
} from "../../dto/leadCapture.dto";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import { statusForMessage } from "../../validation/http";
import { parseUpdateLeadCaptureSettingsDto } from "../../validation/leadCapture";
import { leadCaptureService } from "./leadCapture.service";

export class LeadCaptureController {
  getSettings = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await leadCaptureService.getSettings(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Lead capture settings retrieved",
        data,
      } satisfies ApiResponseDto<LeadCaptureSettingsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load lead capture settings";
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
      const patch = parseUpdateLeadCaptureSettingsDto(req.body);
      const data = await leadCaptureService.updateSettings(
        userId,
        apiKeyId,
        patch,
      );
      return res.status(200).json({
        success: true,
        message: "Lead capture settings updated",
        data,
      } satisfies ApiResponseDto<LeadCaptureSettingsOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update lead capture settings";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  exportLeads = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await leadCaptureService.exportCsv(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Leads exported",
        data,
      } satisfies ApiResponseDto<LeadExportOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export leads";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteLead = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      await leadCaptureService.deleteLead(
        userId,
        apiKeyId,
        parseLeadId(req.params.id),
      );
      return res.status(200).json({
        success: true,
        message: "Lead deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete lead";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listMessages = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await leadCaptureService.listMessages(
        userId,
        apiKeyId,
        parseLeadId(req.params.id),
      );
      return res.status(200).json({
        success: true,
        message: "Lead messages retrieved",
        data,
      } satisfies ApiResponseDto<LeadMessageOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load lead messages";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listLeads = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);
      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await leadCaptureService.listLeads(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Leads retrieved",
        data,
      } satisfies ApiResponseDto<LeadOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list leads";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

function parseLeadId(param: string | string[] | undefined): Types.ObjectId {
  const id = Array.isArray(param) ? param[0] : param;
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new Error("Lead not found");
  }
  return new Types.ObjectId(id);
}

export const leadCaptureController = new LeadCaptureController();

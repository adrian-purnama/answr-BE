import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { ApiKeyCollaboratorOutDto } from "../../dto/apiKeyCollaborator.dto";
import { parseRouteId } from "../../validation/apiKey";
import {
  parseCollaboratorPermissions,
  parseCollaboratorUserId,
} from "../../validation/apiKeyCollaborator";
import { requireUserId, statusForMessage } from "../../validation/http";
import { apiKeyCollaboratorService } from "./apiKeyCollaborator.service";

export class ApiKeyCollaboratorController {
  list = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const apiKeyId = new Types.ObjectId(parseRouteId(req.params.id));
      const data = await apiKeyCollaboratorService.listByApiKey(apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Collaborators retrieved",
        data,
      } satisfies ApiResponseDto<ApiKeyCollaboratorOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list collaborators";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const actorId = requireUserId(req, res);
      if (!actorId) return;

      const apiKeyId = new Types.ObjectId(parseRouteId(req.params.id));
      const userId = parseCollaboratorUserId(req.params.userId);
      const permissions = parseCollaboratorPermissions(req.body);
      const data = await apiKeyCollaboratorService.updatePermissions(
        apiKeyId,
        userId,
        permissions,
      );
      return res.status(200).json({
        success: true,
        message: "Collaborator permissions updated",
        data,
      } satisfies ApiResponseDto<ApiKeyCollaboratorOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update collaborator";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      const actorId = requireUserId(req, res);
      if (!actorId) return;

      const apiKeyId = new Types.ObjectId(parseRouteId(req.params.id));
      const userId = parseCollaboratorUserId(req.params.userId);
      await apiKeyCollaboratorService.remove(apiKeyId, userId);
      return res.status(200).json({
        success: true,
        message: "Collaborator removed",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove collaborator";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  AcceptApiKeyCollaborationInviteOutDto,
  CreateApiKeyCollaborationInviteOutDto,
} from "../../dto/apiKeyCollaborationInvite.dto";
import { parseRouteId } from "../../validation/apiKey";
import { parseCollaborationInviteToken } from "../../validation/apiKeyCollaborationInvite";
import { requireUserId, statusForMessage } from "../../validation/http";
import { apiKeyCollaborationInviteService } from "./apiKeyCollaborationInvite.service";

export class ApiKeyCollaborationInviteController {
  create = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const apiKeyId = new Types.ObjectId(parseRouteId(req.params.id));
      const data = await apiKeyCollaborationInviteService.createForOwner(
        userId,
        apiKeyId,
      );

      return res.status(201).json({
        success: true,
        message: "Collaboration invitation created",
        data,
      } satisfies ApiResponseDto<CreateApiKeyCollaborationInviteOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create collaboration invitation";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  accept = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const token = parseCollaborationInviteToken(req.params.token);
      const data = await apiKeyCollaborationInviteService.acceptForUser(
        userId,
        token,
      );

      return res.status(200).json({
        success: true,
        message: "Collaboration invitation accepted",
        data,
      } satisfies ApiResponseDto<AcceptApiKeyCollaborationInviteOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to accept collaboration invitation";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

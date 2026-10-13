import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  MeetingAvailabilityDto,
  MeetingTopicListOutDto,
  MeetingTopicOutDto,
} from "../../dto/meetingTool.dto";
import type {
  BookMeetingResultDto,
  MeetingOutDto,
} from "../../dto/meeting.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { parseParam } from "../../validation/parseParam";
import {
  parseBookMeetingDto,
  parseCreateMeetingTopicDto,
  parseUpdateMeetingTopicDto,
  parseAvailabilityRangeQuery,
} from "../../validation/meetingTool";
import { meetingToolService } from "./meetingTool.service";
import { meetingService } from "./meeting.service";

function parsePublicKey(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Widget not found");
  }
  return value.trim();
}

function parseSessionIdQuery(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("sessionId is required");
  }
  return value.trim();
}

function parseMeetingTopicIdQuery(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("meetingTopicId is required");
  }
  if (!Types.ObjectId.isValid(value.trim())) {
    throw new Error("Meeting topic not found");
  }
  return value.trim();
}

export class MeetingToolController {
  listTopics = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await meetingToolService.listTopics(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Meeting topics retrieved",
        data,
      } satisfies ApiResponseDto<MeetingTopicListOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list meeting topics";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const input = parseCreateMeetingTopicDto(req.body);
      const data = await meetingToolService.createTopic(
        userId,
        apiKeyId,
        input,
      );
      return res.status(201).json({
        success: true,
        message: "Meeting topic created",
        data,
      } satisfies ApiResponseDto<MeetingTopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create meeting topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const topicId = parseParam(req.params.id, {
        label: "Meeting topic id",
        objectId: true,
      });
      const data = await meetingToolService.getTopic(userId, apiKeyId, topicId);
      return res.status(200).json({
        success: true,
        message: "Meeting topic retrieved",
        data,
      } satisfies ApiResponseDto<MeetingTopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get meeting topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const topicId = parseParam(req.params.id, {
        label: "Meeting topic id",
        objectId: true,
      });
      const patch = parseUpdateMeetingTopicDto(req.body);
      const data = await meetingToolService.updateTopic(
        userId,
        apiKeyId,
        topicId,
        patch,
      );
      return res.status(200).json({
        success: true,
        message: "Meeting topic updated",
        data,
      } satisfies ApiResponseDto<MeetingTopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update meeting topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const topicId = parseParam(req.params.id, {
        label: "Meeting topic id",
        objectId: true,
      });
      await meetingToolService.deleteTopic(userId, apiKeyId, topicId);
      return res.status(200).json({
        success: true,
        message: "Meeting topic deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete meeting topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listMeetings = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const hasFrom = req.query.from !== undefined;
      const hasTo = req.query.to !== undefined;
      const range =
        hasFrom || hasTo
          ? parseAvailabilityRangeQuery(req.query.from, req.query.to)
          : undefined;
      const data = await meetingService.listForOwner(userId, apiKeyId, range);
      return res.status(200).json({
        success: true,
        message: "Meetings retrieved",
        data,
      } satisfies ApiResponseDto<MeetingOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list meetings";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  cancelMeeting = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const meetingId = parseParam(req.params.id, {
        label: "Meeting id",
        objectId: true,
      });
      const data = await meetingService.cancelForOwner(
        userId,
        apiKeyId,
        meetingId,
      );
      return res.status(200).json({
        success: true,
        message: "Meeting cancelled",
        data,
      } satisfies ApiResponseDto<MeetingOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel meeting";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  bookPublic = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const input = parseBookMeetingDto(req.body);
      const data = await meetingService.bookForVisitor(publicKey, input);

      if ("code" in data && data.code === "SLOT_UNAVAILABLE") {
        return res.status(409).json({
          success: false,
          message: "Selected slot is no longer available",
          data,
        } satisfies ApiResponseDto<BookMeetingResultDto>);
      }

      return res.status(201).json({
        success: true,
        message: "Meeting booked successfully",
        data,
      } satisfies ApiResponseDto<BookMeetingResultDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to book meeting";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getPublicAvailability = async (req: Request, res: Response) => {
    try {
      const publicKey = parsePublicKey(req.params.publicKey);
      const sessionId = parseSessionIdQuery(req.query.sessionId);
      const meetingTopicId = parseMeetingTopicIdQuery(req.query.meetingTopicId);
      const range = parseAvailabilityRangeQuery(req.query.from, req.query.to);
      const data = await meetingService.getPublicAvailability(
        publicKey,
        sessionId,
        meetingTopicId,
        range,
      );
      return res.status(200).json({
        success: true,
        message: "Availability retrieved",
        data,
      } satisfies ApiResponseDto<MeetingAvailabilityDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get availability";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

export const meetingToolController = new MeetingToolController();

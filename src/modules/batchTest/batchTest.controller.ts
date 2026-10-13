import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  BatchTestGroupDetailOutDto,
  BatchTestGroupOutDto,
  BatchTestGroupProgressOutDto,
  BatchTestQuestionOutDto,
} from "../../dto/batchTest.dto";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseBatchTestGroupId,
  parseBatchTestQuestionId,
  parseBulkBatchTestQuestionIdsDto,
  parseCreateBatchTestGroupDto,
  parseCreateBatchTestQuestionDto,
  parseSetBatchTestRatingDto,
  parseUpdateBatchTestGroupDto,
  parseUpdateBatchTestQuestionDto,
} from "../../validation/batchTest";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { batchTestService } from "./batchTest.service";

export class BatchTestController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const data = await batchTestService.listGroups(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Batch test groups retrieved",
        data,
      } satisfies ApiResponseDto<BatchTestGroupOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to list batch test groups";
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

      const input = parseCreateBatchTestGroupDto(req.body);
      const data = await batchTestService.createGroup(userId, input);
      return res.status(201).json({
        success: true,
        message: "Batch test group created",
        data,
      } satisfies ApiResponseDto<BatchTestGroupOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create batch test group";
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

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const data = await batchTestService.getGroup(userId, apiKeyId, groupId);
      return res.status(200).json({
        success: true,
        message: "Batch test group retrieved",
        data,
      } satisfies ApiResponseDto<BatchTestGroupDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get batch test group";
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

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const input = parseUpdateBatchTestGroupDto(req.body);
      const data = await batchTestService.updateGroup(
        userId,
        apiKeyId,
        groupId,
        input,
      );
      return res.status(200).json({
        success: true,
        message: "Batch test group updated",
        data,
      } satisfies ApiResponseDto<BatchTestGroupOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update batch test group";
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

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      await batchTestService.deleteGroup(userId, apiKeyId, groupId);
      return res.status(200).json({
        success: true,
        message: "Batch test group deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete batch test group";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  addQuestion = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const input = parseCreateBatchTestQuestionDto(req.body);
      const data = await batchTestService.addQuestion(
        userId,
        apiKeyId,
        groupId,
        input,
      );
      return res.status(201).json({
        success: true,
        message: "Batch test question created",
        data,
      } satisfies ApiResponseDto<BatchTestQuestionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create batch test question";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateQuestion = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const questionId = parseBatchTestQuestionId(req.params.questionId);
      const input = parseUpdateBatchTestQuestionDto(req.body);
      const data = await batchTestService.updateQuestion(
        userId,
        apiKeyId,
        groupId,
        questionId,
        input,
      );
      return res.status(200).json({
        success: true,
        message: "Batch test question updated",
        data,
      } satisfies ApiResponseDto<BatchTestQuestionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update batch test question";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteQuestions = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const input = parseBulkBatchTestQuestionIdsDto(req.body);
      await batchTestService.deleteQuestions(
        userId,
        apiKeyId,
        groupId,
        input.questionIds,
      );
      return res.status(200).json({
        success: true,
        message: "Batch test questions deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete batch test questions";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  run = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const input = parseBulkBatchTestQuestionIdsDto(req.body);
      const data = await batchTestService.runQuestions(
        userId,
        apiKeyId,
        groupId,
        input.questionIds,
      );
      return res.status(202).json({
        success: true,
        message: "Batch test run started",
        data,
      } satisfies ApiResponseDto<BatchTestGroupDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start batch test run";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  progress = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const data = await batchTestService.getProgress(
        userId,
        apiKeyId,
        groupId,
      );
      return res.status(200).json({
        success: true,
        message: "Batch test progress retrieved",
        data,
      } satisfies ApiResponseDto<BatchTestGroupProgressOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get batch test progress";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  setRating = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.query.apiKeyId),
      );
      const groupId = parseBatchTestGroupId(req.params.groupId);
      const questionId = parseBatchTestQuestionId(req.params.questionId);
      const input = parseSetBatchTestRatingDto(req.body);
      const data = await batchTestService.setRating(
        userId,
        apiKeyId,
        groupId,
        questionId,
        input,
      );
      return res.status(200).json({
        success: true,
        message: "Batch test rating saved",
        data,
      } satisfies ApiResponseDto<BatchTestQuestionOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to set batch test rating";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

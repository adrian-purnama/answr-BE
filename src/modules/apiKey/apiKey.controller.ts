import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  ApiKeyOutDto,
  CreateApiKeyOutDto,
} from "../../dto/apiKey.dto";
import {
  parseCreateApiKeyDto,
  parseRouteId,
  parseUpdateApiKeyDto,
} from "../../validation/apiKey";
import { statusForMessage } from "../../validation/http";
import { apiKeyService } from "./apiKey.service";

export class ApiKeyController {
  list = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await apiKeyService.listForUser(req.user._id);
      return res.status(200).json({
        success: true,
        message: "API keys retrieved",
        data,
      } satisfies ApiResponseDto<ApiKeyOutDto[]>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to list API keys",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const input = parseCreateApiKeyDto(req.body);
      const data = await apiKeyService.createForUser(req.user._id, input);

      return res.status(201).json({
        success: true,
        message: "API key created",
        data,
      } satisfies ApiResponseDto<CreateApiKeyOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create API key";
      const status = message.includes("limit reached") ? 403 : 400;

      return res.status(status).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const id = parseRouteId(req.params.id);
      const patch = parseUpdateApiKeyDto(req.body);
      const data = await apiKeyService.updateForUser(req.user._id, id, patch);

      return res.status(200).json({
        success: true,
        message: "API key updated",
        data,
      } satisfies ApiResponseDto<ApiKeyOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update API key",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  revoke = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const id = parseRouteId(req.params.id);
      const data = await apiKeyService.revokeForUser(req.user._id, id);

      return res.status(200).json({
        success: true,
        message: "API key revoked",
        data,
      } satisfies ApiResponseDto<ApiKeyOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to revoke API key",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  rotate = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const id = parseRouteId(req.params.id);
      const data = await apiKeyService.rotateKey(req.user._id, id);

      return res.status(200).json({
        success: true,
        message: "API key rotated",
        data,
      } satisfies ApiResponseDto<CreateApiKeyOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to rotate API key";
      const status = message === "API key not found" ? 404 : 400;

      return res.status(status).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getById = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const id = parseRouteId(req.params.id);
      const data = await apiKeyService.getDetailsForUser(req.user._id, id);

      return res.status(200).json({
        success: true,
        message: "API key retrieved",
        data,
      } satisfies ApiResponseDto<ApiKeyOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve API key";
      const status = statusForMessage(message);

      return res.status(status).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

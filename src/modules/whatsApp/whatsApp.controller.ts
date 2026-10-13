import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { parseApiKeyIdQuery } from "../../validation/apiKey";
import { statusForMessage } from "../../validation/http";
import {
  parseFlowNodes,
  parseUpdateWhatsAppSettingsDto,
} from "../../validation/whatsApp";
import { whatsAppService, type WahaWebhookBody } from "./whatsApp.service";

function scope(req: Request) {
  const { ownerId: userId } = getApiKeyScope(req);
  const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
  return { userId, apiKeyId };
}

function send<T>(
  res: Response,
  message: string,
  fallback: string,
  work: () => Promise<T>,
) {
  return Promise.resolve()
    .then(work)
    .then((data) =>
      res.status(200).json({
        success: true,
        message,
        data,
      } satisfies ApiResponseDto<T>),
    )
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : fallback;
      return res.status(statusForMessage(text)).json({
        success: false,
        message: text,
        data: null,
      } satisfies ApiResponseDto);
    });
}

export class WhatsAppController {
  getSettings = (req: Request, res: Response) =>
    send(res, "WhatsApp settings retrieved", "Failed to load WhatsApp settings", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.getSettings(userId, apiKeyId);
    });

  updateSettings = (req: Request, res: Response) =>
    send(res, "WhatsApp settings updated", "Failed to update WhatsApp settings", () => {
      const { userId, apiKeyId } = scope(req);
      const patch = parseUpdateWhatsAppSettingsDto(req.body);
      return whatsAppService.updateSettings(userId, apiKeyId, patch);
    });

  getQr = (req: Request, res: Response) =>
    send(res, "WhatsApp QR retrieved", "Failed to load WhatsApp QR", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.getQr(userId, apiKeyId);
    });

  logout = (req: Request, res: Response) =>
    send(res, "WhatsApp logged out", "Failed to log out WhatsApp", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.logout(userId, apiKeyId);
    });

  restart = (req: Request, res: Response) =>
    send(res, "WhatsApp restarted", "Failed to restart WhatsApp", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.restart(userId, apiKeyId);
    });

  getFlow = (req: Request, res: Response) =>
    send(res, "WhatsApp flow retrieved", "Failed to load WhatsApp flow", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.getFlow(userId, apiKeyId);
    });

  replaceFlow = (req: Request, res: Response) =>
    send(res, "WhatsApp flow saved", "Failed to save WhatsApp flow", () => {
      const { userId, apiKeyId } = scope(req);
      return whatsAppService.replaceFlow(userId, apiKeyId, parseFlowNodes(req.body));
    });

  /** Unauthenticated. WAHA retries non-2xx, so ignore unknown events with 200. */
  webhook = async (req: Request, res: Response) => {
    const provided = req.get("X-Webhook-Secret") ?? "";
    if (!secretEquals(provided, env.wahaWebhookSecret)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        data: null,
      } satisfies ApiResponseDto);
    }

    const userIdRaw = one(req.params.userId);
    const apiKeyRaw = one(req.params.apiKeyId);
    if (
      !userIdRaw ||
      !apiKeyRaw ||
      !Types.ObjectId.isValid(userIdRaw) ||
      !Types.ObjectId.isValid(apiKeyRaw)
    ) {
      return notFound(res);
    }

    const userId = new Types.ObjectId(userIdRaw);
    const apiKeyId = new Types.ObjectId(apiKeyRaw);
    const expected = `${userIdRaw}-${apiKeyRaw}`;
    const body = (req.body ?? {}) as WahaWebhookBody;
    if (body.session !== expected) return notFound(res);

    const key = await ApiKeyModel.findOne({ _id: apiKeyId, userId })
      .select(
        "whatsAppSetting.sessionName whatsAppSetting.enabled whatsAppSetting.defaultFlow",
      )
      .lean<{
        whatsAppSetting?: {
          sessionName?: string | null;
          enabled?: boolean;
          defaultFlow?: boolean;
        };
      } | null>();
    if (!key || key.whatsAppSetting?.sessionName !== expected) {
      return notFound(res);
    }

    if (body.event === "session.status") {
      logger.info(
        "session.status",
        "modules/whatsApp/whatsApp.controller.ts",
        "webhook",
      );
      await whatsAppService.applySessionStatus(apiKeyId, body);
    }
    if (
      body.event === "message" &&
      key.whatsAppSetting?.enabled === true &&
      key.whatsAppSetting.sessionName
    ) {
      const sessionName = key.whatsAppSetting.sessionName;
      res.status(200).json({
        success: true,
        message: "ok",
        data: null,
      } satisfies ApiResponseDto);
      void whatsAppService
        .handleIncomingMessage(
          userId,
          apiKeyId,
          sessionName,
          body,
          key.whatsAppSetting?.defaultFlow === true,
        )
        .catch((error: unknown) => {
          logger.error(
            error instanceof Error ? error.message : "WhatsApp reply failed",
            "modules/whatsApp/whatsApp.controller.ts",
            "webhook",
          );
        });
      return;
    }
    if (
      body.event === "poll.vote" &&
      key.whatsAppSetting?.enabled === true &&
      key.whatsAppSetting.sessionName &&
      key.whatsAppSetting.defaultFlow === true
    ) {
      const sessionName = key.whatsAppSetting.sessionName;
      res.status(200).json({
        success: true,
        message: "ok",
        data: null,
      } satisfies ApiResponseDto);
      void whatsAppService
        .handlePollVote(userId, apiKeyId, sessionName, body)
        .catch((error: unknown) => {
          logger.error(
            error instanceof Error ? error.message : "WhatsApp vote failed",
            "modules/whatsApp/whatsApp.controller.ts",
            "webhook",
          );
        });
      return;
    }
    return res.status(200).json({
      success: true,
      message: "ok",
      data: null,
    } satisfies ApiResponseDto);
  };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function secretEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    message: "Not found",
    data: null,
  } satisfies ApiResponseDto);
}

export const whatsAppController = new WhatsAppController();

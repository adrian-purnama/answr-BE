import type { Request, Response } from "express";
import type { AgentInfluenceDto } from "../../dto/agent.dto";
import type { MeetingBookingPayloadDto } from "../../dto/meetingTool.dto";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import { parseApiKeyId } from "../../validation/apiKey";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { clientIp } from "../../utils/clientIp";
import { verifyPublicSessionId } from "../../utils/publicSessionToken";
import { toolGuardService } from "../toolGuard/toolGuard.service";
import { agentService } from "./agent.service";

type SseEvent =
  | { type: "token"; text: string }
  | { type: "status"; step: string }
  | {
      type: "tool_ui";
      kind: "live_agent" | "meeting";
      status: "loading" | "error";
      meetingTopicId?: string;
      topicName?: string;
      message?: string;
    }
  | {
      type: "ui";
      format: "ui" | "openui";
      payload: unknown;
    }
  | {
      type: "done";
      influence: AgentInfluenceDto;
      followupQuestions?: string[];
      liveAgentOffer?: {
        message: string;
        action: "create_live_agent_ticket";
      };
      meetingBooking?: MeetingBookingPayloadDto;
      requestFeedback?: boolean;
    }
  | { type: "followup_questions"; followupQuestions: string[] }
  | { type: "error"; message: string };

function parseTestChatBody(body: unknown): { sessionId: string; message: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const sessionId = record.sessionId;
  const message = record.message;

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("sessionId is required");
  }
  if (typeof message !== "string") {
    throw new Error("message is required");
  }

  return {
    sessionId: sessionId.trim(),
    message,
  };
}

function parsePublicKeyParam(
  param: string | string[] | undefined,
): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Widget not found");
  }
  return value.trim();
}

function writeSse(res: Response, event: SseEvent): boolean {
  if (res.writableEnded || res.destroyed) {
    return false;
  }
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  const flushable = res as Response & { flush?: () => void };
  flushable.flush?.();
  return true;
}

function isResponseGone(res: Response): boolean {
  return res.writableEnded || res.destroyed;
}

export class AgentController {
  testChat = async (req: Request, res: Response) => {
    let headersSent = false;

    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(req.query.apiKeyId);
      const { sessionId, message } = parseTestChatBody(req.body);

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      headersSent = true;

      for await (const event of agentService.testAgentChat(
        userId,
        apiKeyId,
        message,
        sessionId,
      )) {
        // Only stop writing if the response is actually gone   do not use
        // req/res "close" flags (they can fire too early on POST+SSE).
        if (isResponseGone(res)) break;
        if (event.type === "token") {
          if (!writeSse(res, { type: "token", text: event.text })) break;
        } else if (event.type === "status") {
          if (!writeSse(res, { type: "status", step: event.step })) break;
        } else if (event.type === "tool_ui") {
          if (
            !writeSse(res, {
              type: "tool_ui",
              kind: event.kind,
              status: event.status,
              ...(event.meetingTopicId
                ? { meetingTopicId: event.meetingTopicId }
                : {}),
              ...(event.topicName ? { topicName: event.topicName } : {}),
              ...(event.message ? { message: event.message } : {}),
            })
          ) {
            break;
          }
        } else if (event.type === "ui") {
          if (
            !writeSse(res, {
              type: "ui",
              format: event.format,
              payload: event.payload,
            })
          ) {
            break;
          }
        } else if (event.type === "done") {
          if (
            !writeSse(res, {
              type: "done",
              influence: event.influence,
              ...(event.liveAgentOffer
                ? { liveAgentOffer: event.liveAgentOffer }
                : {}),
              ...(event.meetingBooking
                ? { meetingBooking: event.meetingBooking }
                : {}),
              ...(event.requestFeedback ? { requestFeedback: true } : {}),
            })
          ) {
            break;
          }
        }
      }

      if (!isResponseGone(res)) {
        res.end();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run agent chat";

      if (!headersSent) {
        return res.status(statusForMessage(message)).json({
          success: false,
          message,
          data: null,
        } satisfies ApiResponseDto);
      }

      writeSse(res, { type: "error", message });
      if (!isResponseGone(res)) {
        res.end();
      }
    }
  };

  widgetChat = async (req: Request, res: Response) => {
    let headersSent = false;

    try {
      const publicKey = parsePublicKeyParam(req.params.publicKey);
      const { sessionId, message } = parseTestChatBody(req.body);
      const canonicalSessionId = verifyPublicSessionId(publicKey, sessionId);
      if (!toolGuardService.allowMessage(canonicalSessionId, clientIp(req))) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({
          success: false,
          message: "Too many messages",
          data: null,
        } satisfies ApiResponseDto);
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      headersSent = true;

      for await (const event of agentService.widgetAgentChat(
        publicKey,
        sessionId,
        message,
      )) {
        if (isResponseGone(res)) break;
        if (event.type === "token") {
          if (!writeSse(res, { type: "token", text: event.text })) break;
        } else if (event.type === "status") {
          if (!writeSse(res, { type: "status", step: event.step })) break;
        } else if (event.type === "tool_ui") {
          if (
            !writeSse(res, {
              type: "tool_ui",
              kind: event.kind,
              status: event.status,
              ...(event.meetingTopicId
                ? { meetingTopicId: event.meetingTopicId }
                : {}),
              ...(event.topicName ? { topicName: event.topicName } : {}),
              ...(event.message ? { message: event.message } : {}),
            })
          ) {
            break;
          }
        } else if (event.type === "ui") {
          if (
            !writeSse(res, {
              type: "ui",
              format: event.format,
              payload: event.payload,
            })
          ) {
            break;
          }
        } else if (event.type === "done") {
          if (
            !writeSse(res, {
              type: "done",
              influence: event.influence,
              ...(event.followupQuestions?.length
                ? { followupQuestions: event.followupQuestions }
                : {}),
              ...(event.liveAgentOffer
                ? { liveAgentOffer: event.liveAgentOffer }
                : {}),
              ...(event.meetingBooking
                ? { meetingBooking: event.meetingBooking }
                : {}),
              ...(event.requestFeedback ? { requestFeedback: true } : {}),
            })
          ) {
            break;
          }
        } else if (event.type === "followup_questions") {
          if (
            !writeSse(res, {
              type: "followup_questions",
              followupQuestions: event.followupQuestions,
            })
          ) {
            break;
          }
        }
      }

      if (!isResponseGone(res)) {
        res.end();
      }
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : "Failed to run agent chat";

      if (!headersSent) {
        return res.status(statusForMessage(errMessage)).json({
          success: false,
          message: errMessage,
          data: null,
        } satisfies ApiResponseDto);
      }

      writeSse(res, { type: "error", message: errMessage });
      if (!isResponseGone(res)) {
        res.end();
      }
    }
  };
}

import type {
  CreateVisitorLiveAgentTicketDto,
  ListAgentTicketsQuery,
  PostLiveAgentTicketMessageDto,
  SubmitLiveAgentTicketRatingDto,
} from "../dto/liveAgentTicket.dto";
import {
  LIVE_AGENT_TICKET_STATUSES,
  type LiveAgentTicketStatus,
} from "../models/liveAgentTicket/liveAgentTicket.interface";
import { parseParam } from "./parseParam";

export function parseLiveAgentTicketId(
  param: string | string[] | undefined,
): string {
  return parseParam(param, { label: "Ticket id", objectId: true });
}

export function parseCreateVisitorLiveAgentTicketDto(
  body: unknown,
): CreateVisitorLiveAgentTicketDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.sessionId !== "string") {
    throw new Error("sessionId must be a string");
  }
  const sessionId = parseParam(raw.sessionId.trim(), {
    label: "sessionId",
  });
  return { sessionId };
}

export function parsePostLiveAgentTicketMessageDto(
  body: unknown,
): PostLiveAgentTicketMessageDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.text !== "string" || !raw.text.trim()) {
    throw new Error("text must be a non-empty string");
  }
  const text = raw.text.trim();
  if (text.length > 4000) {
    throw new Error("text must be at most 4000 characters");
  }
  return { text };
}

export function parseSubmitLiveAgentTicketRatingDto(
  body: unknown,
): SubmitLiveAgentTicketRatingDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const stars = raw.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("stars must be an integer from 1 to 5");
  }
  let feedback: string | undefined;
  if ("feedback" in raw) {
    if (typeof raw.feedback !== "string") {
      throw new Error("feedback must be a string");
    }
    feedback = raw.feedback.trim().slice(0, 2000);
  }
  return { stars, feedback };
}

export function parseListAgentTicketsQuery(
  value: unknown,
): ListAgentTicketsQuery {
  if (value == null || value === "") {
    return { status: "queued" };
  }
  if (typeof value !== "string") {
    throw new Error("status must be a string");
  }
  if (value === "all") {
    return { status: "all" };
  }
  if (!(LIVE_AGENT_TICKET_STATUSES as readonly string[]).includes(value)) {
    throw new Error("status must be queued, claimed, closed, or all");
  }
  return { status: value as LiveAgentTicketStatus };
}

export function parseSessionIdQuery(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("sessionId must be a string");
  }
  return parseParam(value.trim(), { label: "sessionId" });
}

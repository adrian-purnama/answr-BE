import type { LiveAgentTicketStatus } from "../models/liveAgentTicket/liveAgentTicket.interface";
import type { LiveAgentTicketSenderType } from "../models/liveAgentTicketMessage/liveAgentTicketMessage.interface";

export type LiveAgentTicketAiContextTurnDto = {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type LiveAgentTicketRatingDto = {
  stars: number;
  feedback: string;
  submittedAt: string;
};

export type LiveAgentTicketOutDto = {
  id: string;
  apiKeyId: string;
  publicKey: string;
  chatSessionId: string;
  visitorAuthMode: "anonymous" | "authenticated";
  visitorSub: string | null;
  visitorClaims: Record<string, unknown>;
  status: LiveAgentTicketStatus;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  assignedAgentProfilePicture: string | null;
  latestMessagePreview: string;
  queuedAt: string;
  claimedAt: string | null;
  closedAt: string | null;
  rating: LiveAgentTicketRatingDto | null;
  queuePosition?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveAgentTicketDetailOutDto = LiveAgentTicketOutDto & {
  aiContext: LiveAgentTicketAiContextTurnDto[];
};

export type LiveAgentTicketMessageOutDto = {
  id: string;
  ticketId: string;
  senderType: LiveAgentTicketSenderType;
  senderId: string;
  text: string;
  createdAt: string;
};

export type CreateVisitorLiveAgentTicketDto = {
  sessionId: string;
};

export type PostLiveAgentTicketMessageDto = {
  text: string;
};

export type SubmitLiveAgentTicketRatingDto = {
  stars: number;
  feedback?: string;
};

export type ListAgentTicketsQuery = {
  status: LiveAgentTicketStatus | "all";
};

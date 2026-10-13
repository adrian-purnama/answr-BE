import type { Types } from "mongoose";

export const LIVE_AGENT_TICKET_STATUSES = [
  "queued",
  "claimed",
  "closed",
] as const;

export type LiveAgentTicketStatus =
  (typeof LIVE_AGENT_TICKET_STATUSES)[number];

export type LiveAgentTicketAiContextTurn = {
  role: "user" | "assistant";
  text: string;
  createdAt: Date;
};

export type LiveAgentTicketRating = {
  stars: number;
  feedback: string;
  submittedAt: Date;
};

export interface LiveAgentTicketInterface {
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
  publicKey: string;
  chatSessionId: Types.ObjectId;
  visitorAuthMode: "anonymous" | "authenticated";
  visitorSub: string | null;
  visitorClaims: Record<string, unknown>;
  status: LiveAgentTicketStatus;
  assignedAgentId: Types.ObjectId | null;
  assignedAgentName: string | null;
  assignedAgentProfilePicture: string | null;
  aiContext: LiveAgentTicketAiContextTurn[];
  latestMessagePreview: string;
  queuedAt: Date;
  claimedAt: Date | null;
  closedAt: Date | null;
  rating: LiveAgentTicketRating | null;
  createdAt: Date;
  updatedAt: Date;
}

import type { Types } from "mongoose";

export const LIVE_AGENT_TICKET_SENDER_TYPES = [
  "visitor",
  "agent",
  "system",
] as const;

export type LiveAgentTicketSenderType =
  (typeof LIVE_AGENT_TICKET_SENDER_TYPES)[number];

export interface LiveAgentTicketMessageInterface {
  ticketId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  senderType: LiveAgentTicketSenderType;
  senderId: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

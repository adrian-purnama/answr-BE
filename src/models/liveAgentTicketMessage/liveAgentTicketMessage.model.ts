import { Schema, Types, model } from "mongoose";
import type { LiveAgentTicketMessageInterface } from "./liveAgentTicketMessage.interface";
import { LIVE_AGENT_TICKET_SENDER_TYPES } from "./liveAgentTicketMessage.interface";

const liveAgentTicketMessageSchema = new Schema<LiveAgentTicketMessageInterface>(
  {
    ticketId: {
      type: Types.ObjectId,
      ref: "LiveAgentTicket",
      required: true,
    },
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    senderType: {
      type: String,
      enum: LIVE_AGENT_TICKET_SENDER_TYPES,
      required: true,
    },
    senderId: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
  },
  { timestamps: true },
);

liveAgentTicketMessageSchema.index({ ticketId: 1, createdAt: 1 });

export const LiveAgentTicketMessageModel =
  model<LiveAgentTicketMessageInterface>(
    "LiveAgentTicketMessage",
    liveAgentTicketMessageSchema,
  );

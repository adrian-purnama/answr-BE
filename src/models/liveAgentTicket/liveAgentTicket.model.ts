import { Schema, Types, model } from "mongoose";
import type { LiveAgentTicketInterface } from "./liveAgentTicket.interface";
import { LIVE_AGENT_TICKET_STATUSES } from "./liveAgentTicket.interface";

const aiContextTurnSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const ratingSchema = new Schema(
  {
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      required: true,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    submittedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const liveAgentTicketSchema = new Schema<LiveAgentTicketInterface>(
  {
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      required: true,
      index: true,
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    publicKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    chatSessionId: {
      type: Types.ObjectId,
      ref: "ChatSession",
      required: true,
    },
    visitorAuthMode: {
      type: String,
      enum: ["anonymous", "authenticated"],
      required: true,
    },
    visitorSub: {
      type: String,
      required: false,
      default: null,
    },
    visitorClaims: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    status: {
      type: String,
      enum: LIVE_AGENT_TICKET_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },
    assignedAgentId: {
      type: Types.ObjectId,
      ref: "LiveAgent",
      required: false,
      default: null,
    },
    assignedAgentName: {
      type: String,
      required: false,
      default: null,
    },
    assignedAgentProfilePicture: {
      type: String,
      required: false,
      default: null,
    },
    aiContext: {
      type: [aiContextTurnSchema],
      required: true,
      default: [],
    },
    latestMessagePreview: {
      type: String,
      required: true,
      default: "",
      trim: true,
      maxlength: 500,
    },
    queuedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    claimedAt: {
      type: Date,
      required: false,
      default: null,
    },
    closedAt: {
      type: Date,
      required: false,
      default: null,
    },
    rating: {
      type: ratingSchema,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

liveAgentTicketSchema.index({ apiKeyId: 1, status: 1, queuedAt: 1 });
liveAgentTicketSchema.index(
  { chatSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["queued", "claimed"] } },
  },
);

export const LiveAgentTicketModel = model<LiveAgentTicketInterface>(
  "LiveAgentTicket",
  liveAgentTicketSchema,
);

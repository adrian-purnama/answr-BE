import { Schema, Types, model } from "mongoose";
import type { ChatSessionInterface } from "./chatSession.interface";

const chatSessionVisitorSchema = new Schema(
  {
    sub: {
      type: String,
      required: true,
      trim: true,
    },
    claims: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    iss: {
      type: String,
      required: true,
      trim: true,
    },
    verifiedAt: {
      type: Date,
      required: true,
    },
    tokenExp: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const chatSessionSchema = new Schema<ChatSessionInterface>(
  {
    publicKey: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    expiredAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 1000 * 60 * 30),
      expires: 0,
    },
    visitorAuthMode: {
      type: String,
      enum: ["anonymous", "authenticated"],
      required: true,
      default: "anonymous",
    },
    visitor: {
      type: chatSessionVisitorSchema,
      required: false,
      default: null,
    },
    whatsAppChatId: {
      type: String,
      required: false,
    },
    flowActivePollId: {
      type: String,
      default: null,
    },
    flowActiveNodeId: {
      type: String,
      default: null,
    },
    flowSeenVoteIds: {
      type: [String],
      default: [],
    },
    flowBackStack: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

chatSessionSchema.index(
  { apiKeyId: 1, whatsAppChatId: 1 },
  { unique: true, sparse: true },
);

export const ChatSessionModel = model<ChatSessionInterface>(
  "ChatSession",
  chatSessionSchema,
);

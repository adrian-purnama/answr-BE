import { model, Schema, Types } from "mongoose";
import {
  MESSAGE_CONTENT_BLOCK_TYPES,
  MESSAGE_ROLES,
  type ChatMessageInterface,
} from "./message.interface";
const messageContentBlockSchema = new Schema(
  {
    type: {
      type: String,
      enum: MESSAGE_CONTENT_BLOCK_TYPES,
      required: true,
    },
    /** text blocks    aligns with contentReferences TextBlock.content */
    content: { type: String },
    /** image / topic / article / chunk / guidance id */
    id: { type: String },
    alt: { type: String },
    /** tool_call / tool_result */
    name: { type: String },
    callId: { type: String },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    /** ui blocks   deterministic JSON or OpenUI Lang */
    format: { type: String },
    payload: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const messageContextSchema = new Schema(
  {
    topicIds: {
      type: [{ type: Types.ObjectId, ref: "Topic" }],
      default: [],
    },
    guidanceIds: {
      type: [{ type: Types.ObjectId, ref: "Guidance" }],
      default: [],
    },
    chunkIds: {
      type: [{ type: Types.ObjectId, ref: "Chunk" }],
      default: [],
    },
    articleIds: {
      type: [{ type: Types.ObjectId, ref: "Article" }],
      default: [],
    },
  },
  { _id: false },
);

const messageAnalysisGapSchema = new Schema(
  {
    detected: { type: Boolean, required: true, default: false },
    type: { type: String },
    reason: { type: String },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
  },
  { _id: false },
);

const messageAnalysisSchema = new Schema(
  {
    categoryId: { type: Types.ObjectId, ref: "AnalyticsCategory" },
    type: {
      type: String,
      required: true,
    },
    intent: { type: String },
    answerable: { type: Boolean, default: null },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    gap: { type: messageAnalysisGapSchema, default: null },
    analyzedAt: { type: Date, required: true },
  },
  { _id: false },
);

const chatMessageSchema = new Schema<ChatMessageInterface>(
  {
    sessionId: {
      type: Types.ObjectId,
      ref: "ChatSession",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: MESSAGE_ROLES,
      required: true,
    },
    content: {
      type: [messageContentBlockSchema],
      required: true,
      default: [],
    },
    context: {
      type: messageContextSchema,
      required: true,
      default: () => ({
        topicIds: [],
        guidanceIds: [],
        chunkIds: [],
        articleIds: [],
      }),
    },
    runId: {
      type: String,
      index: true,
    },
    parentMessageId: {
      type: Types.ObjectId,
      ref: "ChatMessage",
    },
    memoryKeys: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    analysis: {
      type: messageAnalysisSchema,
      default: null,
    },
  },
  { timestamps: true },
);

chatMessageSchema.index({ sessionId: 1, createdAt: 1 });
chatMessageSchema.index({ sessionId: 1, createdAt: -1 });
chatMessageSchema.index({ "context.topicIds": 1 });
chatMessageSchema.index({ "context.guidanceIds": 1 });
chatMessageSchema.index({ memoryKeys: 1 });

export const ChatMessageModel = model<ChatMessageInterface>(
  "ChatMessage",
  chatMessageSchema,
);

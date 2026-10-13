import type { Types } from "mongoose";
import type { ChatMessageAnalysis } from "./messageAnalytics.types";

export type { ChatMessageAnalysis } from "./messageAnalytics.types";
export {
  ANALYTICS_GAP_TYPES,
  MESSAGE_ANALYTICS_TYPES,
  type AnalyticsGapType,
  type MessageAnalyticsType,
  type ChatMessageAnalysisGap,
  type AgentExecutionMode,
  AGENT_EXECUTION_MODES,
} from "./messageAnalytics.types";

export const MESSAGE_ROLES = [
  "user",
  "assistant",
  "tool",
  "system",
] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_CONTENT_BLOCK_TYPES = [
  "text",
  "image",
  "topic",
  "article",
  "chunk",
  "guidance",
  "tool_call",
  "tool_result",
  "ui",
] as const;

export type MessageContentBlockType =
  (typeof MESSAGE_CONTENT_BLOCK_TYPES)[number];

/** Plain text    same shape as contentReferences TextBlock. */
export type MessageTextBlock = {
  type: "text";
  content: string;
};

/** Media id (GridFS / article media)    same idea as contentReferences ImageBlock. */
export type MessageImageBlock = {
  type: "image";
  id: string;
  alt?: string;
};

/** Training topic that was cited or injected into context. */
export type MessageTopicBlock = {
  type: "topic";
  id: string;
};

export type MessageArticleBlock = {
  type: "article";
  id: string;
};

/** Retrieved RAG chunk that influenced the turn. */
export type MessageChunkBlock = {
  type: "chunk";
  id: string;
};

/** Guidance rule that shaped the assistant response. */
export type MessageGuidanceBlock = {
  type: "guidance";
  id: string;
};

/** LangGraph / tool-calling: outbound tool invocation. */
export type MessageToolCallBlock = {
  type: "tool_call";
  name: string;
  callId: string;
  input?: unknown;
};

/** LangGraph / tool-calling: tool return value. */
export type MessageToolResultBlock = {
  type: "tool_result";
  callId: string;
  name?: string;
  output?: unknown;
};

/** Structured UI description (deterministic JSON or OpenUI Lang payload). */
export type MessageUiBlock = {
  type: "ui";
  format: "ui" | "openui";
  payload: unknown;
};

export type MessageContentBlock =
  | MessageTextBlock
  | MessageImageBlock
  | MessageTopicBlock
  | MessageArticleBlock
  | MessageChunkBlock
  | MessageGuidanceBlock
  | MessageToolCallBlock
  | MessageToolResultBlock
  | MessageUiBlock;

/**
 * Structured provenance for a turn    which training assets
 * were in context / influenced the response (esp. assistant turns).
 * Duplicates ids that may also appear as content blocks for easy queries.
 */
export interface MessageContextInfluence {
  topicIds: Types.ObjectId[];
  guidanceIds: Types.ObjectId[];
  chunkIds: Types.ObjectId[];
  articleIds: Types.ObjectId[];
}

export interface ChatMessageInterface {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  role: MessageRole;
  content: MessageContentBlock[];
  context: MessageContextInfluence;
  /** LangGraph run / invocation id for this turn (optional). */
  runId?: string;
  /** Prior message in a tool loop or reply chain (optional). */
  parentMessageId?: Types.ObjectId;
  /**
   * Long-term memory keys read or written for this turn
   * (LangGraph store / memory namespace keys).
   */
  memoryKeys: string[];
  metadata: Record<string, unknown>;
  /** Latest message-level analytics result (real chat only). */
  analysis?: ChatMessageAnalysis | null;
  createdAt: Date;
  updatedAt: Date;
}

import type { GuidanceAgentItemDto } from "../../dto/guidance.dto";
import type { SessionMeetingFactDto } from "../../dto/meeting.dto";
import type { LlmChatConfig, LlmChatMessage } from "../../llm/types";
import type { ImageHandle } from "../../utils/agentImageHandles";
import type { MemoryEntry } from "./agent.memory";
import type { DeclaredAgentTool } from "./agent.tools";

export type RetrievedChunk = {
  chunkId: string;
  topicId: string;
  articleId?: string;
  content: string;
};

/** Topics expanded from guidance {{topic}} refs this turn. */
export type AgentResolvedTopicRef = {
  id: string;
  name: string;
  articleId: string;
};

export type AgentResolvedToolCall = {
  name: string;
  alias: string;
  ok: boolean;
  error?: string;
  /** Truncated tool arguments for influence / train UI. */
  arguments?: Record<string, unknown>;
  /** Truncated tool return for influence / train UI. */
  result?: unknown;
};

export type AgentResolvedReferences = {
  topics: AgentResolvedTopicRef[];
  tools: AgentResolvedToolCall[];
};

/** Verified visitor identity from ChatSession (never from the LLM). */
export type AgentVisitorIdentity = {
  sub: string;
  claims: Record<string, unknown>;
} | null;

export type AgentTurnState = {
  sessionId: string;
  runId: string;
  userId: string;
  apiKeyId: string;
  userMessage: string;
  /** Prior conversation turns already persisted (before current user message). */
  history: LlmChatMessage[];
  shouldRetrieve: boolean;
  retrievalQuery: string;
  /** Search strings for this turn. Filled when enhancedRetrieval is on. */
  retrievalQueries: string[];
  retrievedChunks: RetrievedChunk[];
  /** Session-scoped durable facts. */
  memories: MemoryEntry[];
  /** Scheduled meetings booked in this chat (source of truth for follow-ups). */
  sessionMeetings: SessionMeetingFactDto[];
  /** Keys read and/or written this turn (audit for ChatMessage.memoryKeys). */
  memoryKeysTouched: string[];
  /** Enabled owner guidance injected this turn (content already reference-resolved). */
  guidances: GuidanceAgentItemDto[];
  /** Topic refs expanded from guidance this turn (for influence / audit). */
  resolvedReferences: AgentResolvedReferences;
  /** Guidance, live agent, lead, and meeting tools, plus MCP tools from retrieved topics. */
  declaredTools: DeclaredAgentTool[];
  /** Alias → tool result bindings after successful MCP calls. */
  toolBindings: Record<string, unknown>;
  /** Messages actually sent to the LLM (built in prepareMessages). */
  llmMessages: LlmChatMessage[];
  responseText: string;
  /** Thinking text for the assistant reply just produced. Not shown to the visitor. */
  responseReasoningContent?: string;
  llmConfig: LlmChatConfig;
  /** Widget visitor identity bound to the chat session, if any. */
  visitor: AgentVisitorIdentity;
  /** Project live-agent feature flag (from ApiKey). */
  liveAgentEnabled: boolean;
  /** API key flag: multi-query search, rerank, and full topic when a chunk was split. */
  enhancedRetrieval: boolean;
  /** Frustration threshold before recommending live agent (`never` = tool-only). */
  liveAgentResilience: "low" | "medium" | "high" | "never";
  /** Set when the built-in call_live_agent tool was invoked this turn. */
  offerLiveAgent: boolean;
  /** Effective Meeting Tool enablement (plan + at least one enabled topic). */
  meetingToolEnabled: boolean;
  /** Plan grants Lead Capture and the project toggle is on. */
  leadCaptureEnabled: boolean;
  /** System brief injected only when lead capture is active. Empty otherwise. */
  leadCaptureBrief: string;
  /** Set when a built-in book_meeting_* tool was invoked this turn. */
  presentMeetingBooking: boolean;
  /** Meeting topic id for the booking UI presented this turn. */
  meetingBookingTopicId: string | null;
  /**
   * Turn-scoped image handles (n → media id) for LLM text.
   * Built in prepareMessages; used to rewrite model output before stream/save.
   */
  imageHandles: ImageHandle[];
  /** When true, skip session memory extract/persist (batch / isolated runs). */
  skipMemoryUpdates?: boolean;
  /** Aborts in-flight Ollama calls for this turn. Set by batch-test question timeout. */
  signal?: AbortSignal;
};

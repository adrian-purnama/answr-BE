import type { MeetingBookingPayloadDto } from "./meetingTool.dto";

export type AgentInfluenceTopicDto = {
  id: string;
  name: string;
  articleId: string;
};

export type AgentInfluenceArticleDto = {
  id: string;
  title: string;
};

export type AgentInfluenceChunkDto = {
  id: string;
  topicId: string;
  articleId: string;
  preview: string;
};

export type AgentInfluenceGuidanceDto = {
  id: string;
  name: string;
};

export type AgentInfluenceToolDto = {
  name: string;
  alias: string;
  ok: boolean;
  error?: string;
  /** Truncated tool call arguments (train/debug). */
  arguments?: Record<string, unknown>;
  /** Truncated MCP / tool return payload (train/debug). */
  result?: unknown;
};

export type AgentInfluenceDeclaredToolDto = {
  name: string;
  alias: string;
};

export type AgentInfluenceDto = {
  topics: AgentInfluenceTopicDto[];
  articles: AgentInfluenceArticleDto[];
  chunks: AgentInfluenceChunkDto[];
  guidances: AgentInfluenceGuidanceDto[];
  tools: AgentInfluenceToolDto[];
  declaredTools: AgentInfluenceDeclaredToolDto[];
};

export type AgentToolUiEvent = {
  type: "tool_ui";
  kind: "live_agent" | "meeting";
  status: "loading" | "error";
  meetingTopicId?: string;
  topicName?: string;
  message?: string;
};

export type AgentTurnEvent =
  | { type: "token"; text: string }
  | { type: "status"; step: string }
  | AgentToolUiEvent
  | {
      type: "ui";
      format: "ui" | "openui";
      payload: unknown;
    }
  | {
      type: "done";
      influence: AgentInfluenceDto;
      followupQuestions?: string[];
      liveAgentOffer?: {
        message: string;
        action: "create_live_agent_ticket";
      };
      meetingBooking?: MeetingBookingPayloadDto;
      requestFeedback?: boolean;
      /** Internal only   not forwarded on SSE. */
      persistedMessageIds?: {
        userMessageId: string;
        assistantMessageId?: string;
      };
    }
  /** Emitted after `done` so the client can unlock input while suggestions generate. */
  | { type: "followup_questions"; followupQuestions: string[] };

import type { Types } from "mongoose";

export const MESSAGE_ANALYTICS_TYPES = [
  "query",
  "answer",
  "confirmation",
  "rejection",
  "clarification",
  "greeting",
  "acknowledgement",
  "farewell",
  "filler",
  "instruction",
  "tool_related",
] as const;

/** Stored value. Projects may add or remove options, so this is not a fixed enum. */
export type MessageAnalyticsType = string;

export const ANALYTICS_GAP_TYPES = [
  "missing_knowledge",
  "unsupported_action",
  "ambiguous_request",
  "tool_failure",
  "insufficient_context",
] as const;

/** Resolvable on the gaps page. Any other slug is a failure. */
export const KNOWLEDGE_GAP_TYPES = [
  "missing_knowledge",
  "insufficient_context",
] as const;

export const FAILURE_GAP_TYPES = [
  "tool_failure",
  "unsupported_action",
  "ambiguous_request",
] as const;

export type AnalyticsGapGroup = "knowledge" | "failure";

const KNOWLEDGE_GAP_TYPE_SET = new Set<string>(KNOWLEDGE_GAP_TYPES);

export function isKnowledgeGapType(
  gapType: string | undefined | null,
): boolean {
  return typeof gapType === "string" && KNOWLEDGE_GAP_TYPE_SET.has(gapType);
}

/** Stored value. Projects may add or remove options, so this is not a fixed enum. */
export type AnalyticsGapType = string;

export interface ChatMessageAnalysisGap {
  detected: boolean;
  type?: AnalyticsGapType;
  reason?: string;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface ChatMessageAnalysis {
  categoryId?: Types.ObjectId;
  type: MessageAnalyticsType;
  intent?: string;
  answerable: boolean | null;
  confidence: number;
  gap?: ChatMessageAnalysisGap | null;
  analyzedAt: Date;
}

export const AGENT_EXECUTION_MODES = ["test", "real", "whatsapp"] as const;
export type AgentExecutionMode = (typeof AGENT_EXECUTION_MODES)[number];

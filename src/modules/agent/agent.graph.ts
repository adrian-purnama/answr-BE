import { Types } from "mongoose";
import {
  chatTurnWithQuota,
  chatWithQuota,
} from "../../llm/chatWithQuota";
import { logger } from "../../logger/logger";
import type {
  LlmChatConfig,
  LlmChatMessage,
  LlmChatTurnResult,
  LlmToolCall,
  LlmToolDefinition,
} from "../../llm/types";
import { articleService } from "../article/article.service";
import { guidanceService } from "../guidance/guidance.service";
import { mcpService } from "../mcp/mcp.service";
import { tryBuildToolUi } from "../uiTemplate/resolveToolUi";
import {
  applyVarBindings,
  resolveContentReferences,
} from "../../utils/contentReferences";
import {
  buildImageHandleCatalog,
  toLlmImageHandles,
  type ImageHandle,
} from "../../utils/agentImageHandles";
import {
  applyMemoryUpdates,
  listMemories,
  type MemoryUpdates,
} from "./agent.memory";
import {
  GUARDRAILS_SYSTEM_PROMPT,
  clockContextPrompt,
  conversationResolvedPrompt,
  liveAgentOfferPrompt,
  liveAgentOnRequestPrompt,
  liveAgentUnavailablePrompt,
  leadCapturePrompt,
  meetingBookingPrompt,
  sessionMeetingsPrompt,
  imageHandlesPrompt,
  MEMORY_EXTRACT_PROMPT,
  RETRIEVAL_EXPAND_PROMPT,
  RETRIEVAL_GATE_PROMPT,
  toolResultContentWithUiHint,
  toolUiShownPrompt,
} from "./agent.prompts";
import { leadCaptureService } from "../leadCapture/leadCapture.service";
import { entitlementService } from "../entitlement/entitlement.service";
import { meetingToolService } from "../meetingTool/meetingTool.service";
import { meetingService } from "../meetingTool/meeting.service";
import { toolGuardService } from "../toolGuard/toolGuard.service";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import {
  type AgentTurnState,
  type AgentResolvedReferences,
  type AgentResolvedToolCall,
  type RetrievedChunk,
} from "./agent.state";
import {
  aliasesNeededForVariables,
  appendDeclaredToolsFromTopics,
  collectDeclaredTools,
  formatDeclaredToolsPrompt,
  isBookMeetingToolName,
  isCallLiveAgentTool,
  isRecordLeadFieldsTool,
  isSubmitLeadTool,
  normalizeToolResult,
  resolveDeclaredToolCall,
  toLlmToolDefinitions,
  truncateToolResultForInfluence,
  type DeclaredAgentTool,
} from "./agent.tools";
import type { LiveAgentResilience } from "../../dto/liveAgent.dto";
import {
  LIVE_AGENT_HANDOFF_DENY_INSTRUCTION,
  logLiveAgentHandoffDecision,
  parseLiveAgentHandoffArgs,
  shouldAllowLiveAgentHandoff,
} from "./liveAgentHandoff";

const GATE_HISTORY_TURNS = 8;
const EXPANDED_QUERY_LIMIT = 3;
const MAX_TOOL_ROUNDS = 3;
/** Assistant replies shorter than this without terminal punctuation are treated as truncated. */
const INCOMPLETE_ASSISTANT_MAX_LEN = 100;
const CUTOFF_COMPLAINT_RE =
  /\b(cut\s*-?\s*off|truncated|incomplete|terpotong|lanjutkan|continue|got\s+cut|was\s+cut)\b/i;

function auditToolArgs(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!args || Object.keys(args).length === 0) return undefined;
  const truncated = truncateToolResultForInfluence(args);
  if (
    truncated &&
    typeof truncated === "object" &&
    !Array.isArray(truncated)
  ) {
    return truncated as Record<string, unknown>;
  }
  return { value: truncated };
}

function auditOkTool(
  name: string,
  alias: string,
  result: unknown,
  args?: Record<string, unknown>,
): AgentResolvedToolCall {
  const argumentsPayload = auditToolArgs(args);
  return {
    name,
    alias,
    ok: true,
    ...(argumentsPayload ? { arguments: argumentsPayload } : {}),
    result: truncateToolResultForInfluence(result),
  };
}

function auditFailTool(
  name: string,
  alias: string,
  error: string,
  args?: Record<string, unknown>,
): AgentResolvedToolCall {
  const argumentsPayload = auditToolArgs(args);
  return {
    name,
    alias,
    ok: false,
    error,
    ...(argumentsPayload ? { arguments: argumentsPayload } : {}),
  };
}

function normalizeLiveAgentResilience(value: unknown): LiveAgentResilience {
  if (value === "low" || value === "high" || value === "never") return value;
  return "medium";
}

function leadFieldArgs(args: Record<string, unknown>): Record<string, string> {
  const source =
    args.fields && typeof args.fields === "object" && !Array.isArray(args.fields)
      ? (args.fields as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function mergeSapAiToolArgs(
  llmArgs: Record<string, unknown> | undefined,
  state: AgentTurnState,
): Record<string, unknown> {
  const raw = llmArgs && typeof llmArgs === "object" ? { ...llmArgs } : {};
  delete raw._sapai;
  if (!state.visitor) {
    return raw;
  }
  return {
    ...raw,
    _sapai: {
      visitor: {
        sub: state.visitor.sub,
        claims: state.visitor.claims,
      },
      sessionId: state.sessionId,
    },
  };
}

type RetrievalGateDecision = {
  retrieve: boolean;
  query: string;
};

async function completeChat(
  messages: LlmChatMessage[],
  state: AgentTurnState,
): Promise<string> {
  return chatWithQuota({
    userId: state.userId,
    messages,
    temperature: state.llmConfig.temperature,
    think: state.llmConfig.think,
    signal: state.signal,
    logSource: "modules/agent/agent.graph.ts",
  });
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function parseRetrievalGate(raw: string): RetrievalGateDecision | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      retrieve?: unknown;
      query?: unknown;
    };
    if (typeof parsed.retrieve !== "boolean") return null;
    const query =
      typeof parsed.query === "string" ? parsed.query.trim() : "";
    return { retrieve: parsed.retrieve, query };
  } catch {
    return null;
  }
}

function parseMemoryUpdates(raw: string): MemoryUpdates | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      upserts?: unknown;
      deletes?: unknown;
    };
    const upserts: MemoryUpdates["upserts"] = [];
    if (Array.isArray(parsed.upserts)) {
      for (const item of parsed.upserts) {
        if (!item || typeof item !== "object") continue;
        const record = item as { key?: unknown; value?: unknown };
        if (typeof record.key !== "string" || typeof record.value !== "string") {
          continue;
        }
        upserts.push({ key: record.key, value: record.value });
      }
    }
    const deletes: string[] = [];
    if (Array.isArray(parsed.deletes)) {
      for (const key of parsed.deletes) {
        if (typeof key === "string" && key.trim()) {
          deletes.push(key);
        }
      }
    }
    return { upserts, deletes };
  } catch {
    return null;
  }
}

function formatHistoryForGate(history: LlmChatMessage[]): string {
  const recent = history.slice(-GATE_HISTORY_TURNS);
  if (recent.length === 0) return "(no prior messages)";
  return recent
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function looksIncompleteAssistant(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.length > INCOMPLETE_ASSISTANT_MAX_LEN) return false;
  if (/[-– ,:]$/.test(trimmed)) return true;
  if (/\*\*[^*]*$/.test(trimmed)) return true;
  if (!/[.!?…]["')\]]*$/.test(trimmed)) return true;
  return false;
}

function lastSubstantiveUserQuestion(
  history: LlmChatMessage[],
): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message.role !== "user") continue;
    const content = message.content.trim();
    if (!content || CUTOFF_COMPLAINT_RE.test(content)) continue;
    return content;
  }
  return null;
}

/**
 * When a prior turn was interrupted (no assistant persisted, or a stump reply),
 * force retrieval so we do not answer "I don't know" from an empty context.
 */
function forcedRetrievalAfterBrokenTurn(
  history: LlmChatMessage[],
  userMessage: string,
): RetrievalGateDecision | null {
  if (history.length === 0) return null;

  const latest = userMessage.trim();
  const last = history[history.length - 1];

  if (last.role === "user") {
    return {
      retrieve: true,
      query: latest || last.content.trim(),
    };
  }

  if (
    last.role === "assistant" &&
    looksIncompleteAssistant(last.content)
  ) {
    return {
      retrieve: true,
      query:
        (CUTOFF_COMPLAINT_RE.test(latest)
          ? lastSubstantiveUserQuestion(history)
          : null) ||
        latest ||
        lastSubstantiveUserQuestion(history) ||
        last.content.trim(),
    };
  }

  if (CUTOFF_COMPLAINT_RE.test(latest)) {
    return {
      retrieve: true,
      query: lastSubstantiveUserQuestion(history) || latest,
    };
  }

  return null;
}

function imageHandleSources(state: AgentTurnState): string[] {
  return [
    ...state.retrievedChunks.map((chunk) => chunk.content),
    ...state.guidances.map((guidance) => guidance.content),
    ...state.history.map((message) => message.content),
  ];
}

function formatRetrievedContext(
  chunks: RetrievedChunk[],
  catalog: ImageHandle[],
): string {
  return chunks
    .map(
      (chunk, index) =>
        `[chunk ${index + 1}] (article=${chunk.articleId ?? "snippet"}, topic=${chunk.topicId}, chunk=${chunk.chunkId})\n${toLlmImageHandles(chunk.content, catalog)}`,
    )
    .join("\n\n");
}

function formatMemories(
  memories: AgentTurnState["memories"],
): string {
  return memories.map((entry) => `- ${entry.key}: ${entry.value}`).join("\n");
}

function formatGuidances(
  guidances: AgentTurnState["guidances"],
  bindings: Record<string, unknown>,
  catalog: ImageHandle[],
): string {
  return guidances
    .map((guidance, index) => {
      const content = toLlmImageHandles(
        applyVarBindings(guidance.content, bindings),
        catalog,
      );
      return `[guidance ${index + 1}] ${guidance.title}\n${content}`;
    })
    .join("\n\n");
}

function buildLlmMessages(
  state: AgentTurnState,
  bindings: Record<string, unknown>,
): LlmChatMessage[] {
  const catalog =
    (state.imageHandles?.length ?? 0) > 0
      ? state.imageHandles
      : buildImageHandleCatalog(imageHandleSources(state));

  const llmMessages: LlmChatMessage[] = [
    { role: "system", content: GUARDRAILS_SYSTEM_PROMPT },
    { role: "system", content: clockContextPrompt() },
    {
      role: "system",
      content: conversationResolvedPrompt(
        state.liveAgentEnabled && state.liveAgentResilience !== "never",
      ),
    },
  ];

  const handlesPrompt = imageHandlesPrompt(catalog.length);
  if (handlesPrompt) {
    llmMessages.push({ role: "system", content: handlesPrompt });
  }

  if (!state.liveAgentEnabled) {
    llmMessages.push({
      role: "system",
      content: liveAgentUnavailablePrompt(),
    });
  } else if (state.liveAgentResilience === "never") {
    llmMessages.push({
      role: "system",
      content: liveAgentOnRequestPrompt(),
    });
  } else if (
    state.liveAgentResilience === "low" ||
    state.liveAgentResilience === "medium" ||
    state.liveAgentResilience === "high"
  ) {
    llmMessages.push({
      role: "system",
      content: liveAgentOfferPrompt(state.liveAgentResilience),
    });
  }

  const meetingTools = state.declaredTools.filter(
    (tool) => typeof tool.meetingTopicId === "string" && tool.meetingTopicId,
  );
  if (meetingTools.length > 0) {
    const prompt = meetingBookingPrompt(
      meetingTools.map((tool) => ({
        name: tool.title,
        slug: tool.meetingTopicSlug ?? tool.as,
        toolName: tool.name,
      })),
    );
    if (prompt) {
      llmMessages.push({ role: "system", content: prompt });
    }
  }

  if (state.sessionMeetings.length > 0) {
    const booked = sessionMeetingsPrompt(state.sessionMeetings);
    if (booked) {
      llmMessages.push({ role: "system", content: booked });
    }
  }

  if (state.leadCaptureEnabled && state.leadCaptureBrief) {
    llmMessages.push({ role: "system", content: state.leadCaptureBrief });
  }

  if (state.declaredTools.length > 0) {
    llmMessages.push({
      role: "system",
      content: formatDeclaredToolsPrompt(state.declaredTools),
    });
  }

  if (state.guidances.length > 0) {
    llmMessages.push({
      role: "system",
      content: `Owner guidance (follow these rules):\n\n${formatGuidances(state.guidances, bindings, catalog)}`,
    });
  }

  if (state.memories.length > 0) {
    llmMessages.push({
      role: "system",
      content: `Session memory (durable facts for this chat):\n${formatMemories(state.memories)}`,
    });
  }

  if (state.retrievedChunks.length > 0) {
    llmMessages.push({
      role: "system",
      content: `Knowledge context for this turn:\n\n${formatRetrievedContext(state.retrievedChunks, catalog)}`,
    });
  }

  if (Object.keys(bindings).length > 0) {
    llmMessages.push({
      role: "system",
      content: `Tool output bindings (alias → JSON):\n${JSON.stringify(bindings, null, 2)}`,
    });
  }

  llmMessages.push(
    ...state.history.map((message) => ({
      ...message,
      content: toLlmImageHandles(message.content, catalog),
    })),
    {
      role: "user",
      content: toLlmImageHandles(state.userMessage, catalog),
    },
  );

  return llmMessages;
}

async function loadMemory(
  state: AgentTurnState,
): Promise<Partial<AgentTurnState>> {
  const emptyResolved: AgentResolvedReferences = { topics: [], tools: [] };
  const empty = {
    memories: [] as AgentTurnState["memories"],
    memoryKeysTouched: [] as string[],
    guidances: [] as AgentTurnState["guidances"],
    sessionMeetings: [] as AgentTurnState["sessionMeetings"],
    resolvedReferences: emptyResolved,
    declaredTools: [] as DeclaredAgentTool[],
    toolBindings: {} as Record<string, unknown>,
    liveAgentEnabled: false,
    liveAgentResilience: "medium" as const,
    offerLiveAgent: false,
    meetingToolEnabled: false,
    presentMeetingBooking: false,
    meetingBookingTopicId: null as string | null,
    leadCaptureEnabled: false,
    leadCaptureBrief: "",
  };

  if (
    !Types.ObjectId.isValid(state.sessionId) ||
    !Types.ObjectId.isValid(state.userId) ||
    !Types.ObjectId.isValid(state.apiKeyId)
  ) {
    return empty;
  }

  try {
    const apiKeyId = new Types.ObjectId(state.apiKeyId);
    const userId = new Types.ObjectId(state.userId);
    // Guidance is enabled-only; session memory is chat-scoped (not article/topic).
    const [memories, rawGuidances, apiKey, enabledMeetingTopics, sessionMeetings, leadContext] =
      await Promise.all([
        listMemories(new Types.ObjectId(state.sessionId)),
        guidanceService.listEnabledForAgent(apiKeyId),
        ApiKeyModel.findById(apiKeyId).lean(),
        meetingToolService.listEnabledTopicsForAgent(userId, apiKeyId),
        meetingService.listScheduledForSession(
          new Types.ObjectId(state.sessionId),
        ),
        leadCaptureService.agentContext(userId, apiKeyId, state.sessionId),
      ]);
    const projectLiveAgentEnabled =
      apiKey?.liveAgentSetting?.enabled === true;
    const planLiveAgentEnabled = await entitlementService.hasLiveAgent(
      userId,
      apiKeyId,
    );
    const liveAgentEnabled = projectLiveAgentEnabled && planLiveAgentEnabled;
    const liveAgentResilience = normalizeLiveAgentResilience(
      apiKey?.liveAgentSetting?.resilience,
    );
    const meetingToolEnabled = enabledMeetingTopics.length > 0;

    const resolvedTopics = new Map<
      string,
      AgentResolvedReferences["topics"][number]
    >();
    const guidances: AgentTurnState["guidances"] = [];

    for (const guidance of rawGuidances) {
      const resolved = await resolveContentReferences(guidance.content, {
        apiKeyId,
        depth: 1,
      });
      guidances.push({
        id: guidance.id,
        title: guidance.title,
        content: resolved.text,
      });
      for (const topic of resolved.resolved.topics) {
        resolvedTopics.set(topic.id.toLowerCase(), topic);
      }
    }

    const bookedTopicIds = new Set(
      sessionMeetings.map((meeting) => meeting.meetingTopicId),
    );
    const declaredTools = (
      await collectDeclaredTools({
        apiKeyId,
        userId,
        guidanceContents: rawGuidances.map((g) => g.content ?? ""),
        liveAgentEnabled,
        liveAgentResilience,
        enabledMeetingTopics,
        leadCaptureEnabled: leadContext !== null,
      })
    ).filter((tool) => {
      if (
        isBookMeetingToolName(tool.name) &&
        tool.meetingTopicId &&
        bookedTopicIds.has(tool.meetingTopicId)
      ) {
        return false;
      }
      if (
        isCallLiveAgentTool(tool.name) &&
        !toolGuardService.canEmit(state.sessionId, "live_agent")
      ) {
        return false;
      }
      if (
        isBookMeetingToolName(tool.name) &&
        !toolGuardService.canEmit(state.sessionId, "booking_prompt")
      ) {
        return false;
      }
      return true;
    });

    return {
      memories,
      sessionMeetings,
      memoryKeysTouched: memories.map((entry) => entry.key),
      guidances,
      resolvedReferences: {
        topics: [...resolvedTopics.values()],
        tools: [],
      },
      declaredTools,
      toolBindings: {},
      liveAgentEnabled,
      liveAgentResilience,
      offerLiveAgent: false,
      meetingToolEnabled,
      presentMeetingBooking: false,
      meetingBookingTopicId: null,
      leadCaptureEnabled: leadContext !== null,
      leadCaptureBrief: leadContext ? leadCapturePrompt(leadContext) : "",
    };
  } catch {
    return empty;
  }
}

function parseExpandedQueries(raw: string): string[] {
  const json = extractJsonObject(raw);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return [];
    return parsed.queries.filter(
      (query): query is string => typeof query === "string",
    );
  } catch {
    return [];
  }
}

function mergeRetrievalQueries(primary: string, expanded: string[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const query of [primary, ...expanded]) {
    const trimmed = query.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    queries.push(trimmed);
    if (queries.length === EXPANDED_QUERY_LIMIT) break;
  }
  return queries;
}

async function expandRetrievalQueries(
  state: AgentTurnState,
  primary: string,
): Promise<string[]> {
  const trimmed = primary.trim();
  if (!trimmed) return [];
  try {
    const raw = await completeChat(
      [
        { role: "system", content: RETRIEVAL_EXPAND_PROMPT },
        {
          role: "user",
          content: `Recent conversation:\n${formatHistoryForGate(state.history)}\n\nInformation need:\n${trimmed}`,
        },
      ],
      state,
    );
    const merged = mergeRetrievalQueries(trimmed, parseExpandedQueries(raw));
    return merged.length > 0 ? merged : [trimmed];
  } catch (error) {
    if (state.signal?.aborted) throw error;
    return [trimmed];
  }
}

async function withExpandedQueries(
  state: AgentTurnState,
  decision: { shouldRetrieve: boolean; retrievalQuery: string },
): Promise<Partial<AgentTurnState>> {
  if (!state.enhancedRetrieval || !decision.shouldRetrieve) {
    return { ...decision, retrievalQueries: [] };
  }
  return {
    ...decision,
    retrievalQueries: await expandRetrievalQueries(
      state,
      decision.retrievalQuery,
    ),
  };
}

/**
 * Decide whether this turn needs a fresh knowledge-base retrieval.
 * First turn always retrieves; later turns use a JSON gate over recent history.
 * Retrieval itself only returns chunks from enabled articles/topics.
 * Enhanced retrieval also writes up to three search queries.
 */
async function decideRetrieval(
  state: AgentTurnState,
): Promise<Partial<AgentTurnState>> {
  if (state.history.length === 0) {
    return withExpandedQueries(state, {
      shouldRetrieve: true,
      retrievalQuery: state.userMessage,
    });
  }

  const forced = forcedRetrievalAfterBrokenTurn(
    state.history,
    state.userMessage,
  );
  if (forced) {
    return withExpandedQueries(state, {
      shouldRetrieve: true,
      retrievalQuery: forced.query || state.userMessage,
    });
  }

  const raw = await completeChat(
    [
      { role: "system", content: RETRIEVAL_GATE_PROMPT },
      {
        role: "user",
        content: `Recent conversation:\n${formatHistoryForGate(state.history)}\n\nLatest user message:\n${state.userMessage}`,
      },
    ],
    state,
  );

  const decision = parseRetrievalGate(raw);
  if (!decision) {
    return withExpandedQueries(state, {
      shouldRetrieve: true,
      retrievalQuery: state.userMessage,
    });
  }

  return withExpandedQueries(state, {
    shouldRetrieve: decision.retrieve,
    retrievalQuery: decision.retrieve
      ? decision.query || state.userMessage
      : "",
  });
}

async function retrieveKnowledge(
  state: AgentTurnState,
): Promise<Partial<AgentTurnState>> {
  if (!state.shouldRetrieve) {
    return { retrievedChunks: [] };
  }

  const query = state.retrievalQuery.trim() || state.userMessage.trim();
  if (!query) {
    return { retrievedChunks: [] };
  }

  if (
    !Types.ObjectId.isValid(state.userId) ||
    !Types.ObjectId.isValid(state.apiKeyId)
  ) {
    return { retrievedChunks: [] };
  }

  try {
    const userId = new Types.ObjectId(state.userId);
    const apiKeyId = new Types.ObjectId(state.apiKeyId);
    // Both paths drop hits from disabled articles/topics.
    const results = state.enhancedRetrieval
      ? await articleService.getEnhancedChunks(
          userId,
          apiKeyId,
          state.retrievalQueries.length > 0 ? state.retrievalQueries : [query],
          query,
          state.signal,
        )
      : await articleService.getRelevantChunks(userId, apiKeyId, query, {
          signal: state.signal,
        });

    const retrievedChunks: RetrievedChunk[] = results.map((result) => ({
      chunkId: result.chunkId,
      topicId: result.topicId,
      ...(result.articleId ? { articleId: result.articleId } : {}),
      content: result.content,
    }));

    return { retrievedChunks };
  } catch (error) {
    if (state.signal?.aborted) throw error;
    return { retrievedChunks: [] };
  }
}

async function loadRetrievedTopicTools(
  state: AgentTurnState,
): Promise<Partial<AgentTurnState>> {
  if (
    state.retrievedChunks.length === 0 ||
    !Types.ObjectId.isValid(state.userId) ||
    !Types.ObjectId.isValid(state.apiKeyId)
  ) {
    return {};
  }

  const declaredTools = await appendDeclaredToolsFromTopics({
    apiKeyId: new Types.ObjectId(state.apiKeyId),
    userId: new Types.ObjectId(state.userId),
    topicIds: state.retrievedChunks.map((chunk) => chunk.topicId),
    declared: state.declaredTools,
  });
  return { declaredTools };
}

function prepareMessages(state: AgentTurnState): Partial<AgentTurnState> {
  const imageHandles = buildImageHandleCatalog(imageHandleSources(state));
  return {
    imageHandles,
    llmMessages: buildLlmMessages(
      { ...state, imageHandles },
      state.toolBindings ?? {},
    ),
  };
}

type ToolUiNotify = (event: {
  kind: "live_agent" | "meeting";
  meetingTopicId?: string;
  topicName?: string;
}) => void;

type UiDescNotify = (event: {
  payload: unknown;
  renderMode: "deterministic" | "auto";
}) => void;

function makeAgentTurnChat(
  initial: LlmChatConfig,
  userId: string,
  signal?: AbortSignal,
) {
  /** Sticky: after DeepSeek fails once this turn, stay on Ollama. */
  let forceOllama = initial.provider !== "deepseek";

  return async function streamAgentTurn(
    messages: LlmChatMessage[],
    tools: LlmToolDefinition[],
    onToken?: (token: string) => void,
  ): Promise<LlmChatTurnResult> {
    const turn = await chatTurnWithQuota({
      userId,
      messages,
      tools,
      onToken,
      signal,
      temperature: initial.temperature,
      think: initial.think,
      forceOllama,
      logSource: "modules/agent/agent.graph.ts",
    });
    if (turn.provider === "ollama") {
      forceOllama = true;
    }
    const { provider: _provider, ...result } = turn;
    return result;
  };
}

async function generateResponse(
  state: AgentTurnState,
  onToken?: (token: string) => void,
  onToolUi?: ToolUiNotify,
  onUiDesc?: UiDescNotify,
  onStatus?: (step: string) => void,
): Promise<Partial<AgentTurnState>> {
  const declared = state.declaredTools ?? [];
  const toolDefs = toLlmToolDefinitions(declared);
  const declaredByAlias = new Map(
    declared.map((tool) => [tool.as.toLowerCase(), tool]),
  );

  let bindings: Record<string, unknown> = { ...(state.toolBindings ?? {}) };
  let offerLiveAgent = Boolean(state.offerLiveAgent);
  let presentMeetingBooking = Boolean(state.presentMeetingBooking);
  let meetingBookingTopicId = state.meetingBookingTopicId ?? null;
  let handledBookMeetingTool = false;
  let emittedLiveUi = offerLiveAgent;
  let emittedMeetingUi = Boolean(presentMeetingBooking && meetingBookingTopicId);
  let uiEmitCount = 0;
  let lastStatusStep = "";
  const toolAudit: AgentResolvedReferences["tools"] = [
    ...(state.resolvedReferences?.tools ?? []),
  ];

  const emitStatus = (step: string) => {
    const trimmed = step.trim();
    if (!trimmed || trimmed === lastStatusStep) return;
    lastStatusStep = trimmed;
    onStatus?.(trimmed);
  };

  const userId = Types.ObjectId.isValid(state.userId)
    ? new Types.ObjectId(state.userId)
    : null;
  const apiKeyId = Types.ObjectId.isValid(state.apiKeyId)
    ? new Types.ObjectId(state.apiKeyId)
    : null;

  const emitToolUi = async (
    toolName: string,
    toolResult: unknown,
    isError: boolean,
  ): Promise<boolean> => {
    if (!apiKeyId) return false;
    const built = await tryBuildToolUi({
      apiKeyId,
      toolName,
      toolResult,
      isError,
      llmConfig: state.llmConfig,
      userId: state.userId,
    });
    if (!built) return false;
    uiEmitCount += 1;
    if (uiEmitCount > 1) {
      logger.warn(
        `Multiple tool UI payloads in one turn; keeping last (tool=${toolName}, mode=${built.renderMode})`,
        "modules/agent/agent.graph.ts",
        "emitToolUi",
      );
    }
    onUiDesc?.({
      payload: built.payload,
      renderMode: built.renderMode,
    });
    return true;
  };

  const withToolUiShownSystemHint = (
    msgs: LlmChatMessage[],
  ): LlmChatMessage[] => {
    if (uiEmitCount === 0) return msgs;
    const marker = "structured UI card already";
    if (
      msgs.some(
        (m) => m.role === "system" && m.content.includes(marker),
      )
    ) {
      return msgs;
    }
    return [...msgs, { role: "system", content: toolUiShownPrompt() }];
  };

  const emitLiveUi = () => {
    if (emittedLiveUi) return;
    emittedLiveUi = true;
    onToolUi?.({ kind: "live_agent" });
  };
  const emitMeetingUi = (topicId: string, topicName?: string) => {
    if (emittedMeetingUi) return;
    emittedMeetingUi = true;
    onToolUi?.({
      kind: "meeting",
      meetingTopicId: topicId,
      ...(topicName ? { topicName } : {}),
    });
  };

  const streamAgentTurn = makeAgentTurnChat(
    state.llmConfig,
    state.userId,
    state.signal,
  );

  // Eagerly bind tools referenced by unresolved tool_variable tokens in guidance.
  if (userId && apiKeyId && declared.length > 0) {
    const needed = aliasesNeededForVariables(
      (state.guidances ?? []).map((guidance) => guidance.content ?? ""),
    );
    for (const aliasKey of needed) {
      const alreadyBound = Object.keys(bindings).some(
        (key) => key.toLowerCase() === aliasKey,
      );
      if (alreadyBound) continue;
      const tool = declaredByAlias.get(aliasKey);
      if (!tool) continue;
      // Handoff / booking UI must be an intentional model call, never eager-bound.
      if (isCallLiveAgentTool(tool.name)) continue;
      if (isBookMeetingToolName(tool.name)) continue;

      try {
        emitStatus(statusLabelForTool(tool));
        const invoked = await mcpService.callEnabledTool(
          userId,
          apiKeyId,
          tool.name,
          mergeSapAiToolArgs({}, state),
        );
        const normalized = normalizeToolResult(invoked.result);
        if (!invoked.isError) {
          bindings = { ...bindings, [tool.as]: normalized };
        }
        await emitToolUi(tool.name, normalized, invoked.isError);
        toolAudit.push(
          invoked.isError
            ? auditFailTool(
                tool.name,
                tool.as,
                "MCP tool returned an error",
                mergeSapAiToolArgs({}, state),
              )
            : auditOkTool(
                tool.name,
                tool.as,
                normalized,
                mergeSapAiToolArgs({}, state),
              ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Tool call failed";
        toolAudit.push(
          auditFailTool(
            tool.name,
            tool.as,
            message,
            mergeSapAiToolArgs({}, state),
          ),
        );
      }
    }
  }

  let messages = withToolUiShownSystemHint(buildLlmMessages(state, bindings));

  if (toolDefs.length === 0 || !userId || !apiKeyId) {
    const turn = await streamAgentTurn(messages, [], onToken);
    return {
      responseText: turn.text,
      responseReasoningContent: turn.reasoningContent ?? "",
      llmMessages: messages,
      toolBindings: bindings,
      offerLiveAgent,
      presentMeetingBooking,
      meetingBookingTopicId,
      resolvedReferences: {
        topics: state.resolvedReferences?.topics ?? [],
        tools: toolAudit,
      },
    };
  }

  let responseText = "";
  let responseReasoning = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Stream tokens live; tool calls (if any) arrive when the stream completes.
    const turn = await streamAgentTurn(
      messages,
      toolDefs,
      onToken,
    );
    const calls: LlmToolCall[] = turn.toolCalls ?? [];

    if (calls.length === 0) {
      responseText = turn.text;
      responseReasoning = turn.reasoningContent ?? "";
      break;
    }

    messages = [
      ...messages,
      {
        role: "assistant",
        content: turn.text || "",
        toolCalls: calls,
        ...(turn.reasoningContent
          ? { reasoningContent: turn.reasoningContent }
          : {}),
      },
    ];

    for (const call of calls) {
      const callArgs = call.arguments ?? {};
      const matched = resolveDeclaredToolCall(declared, call.name);
      if (!matched) {
        toolAudit.push(
          auditFailTool(
            call.name,
            "",
            "Tool is not declared or not enabled",
            callArgs,
          ),
        );
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify({
            error: "Tool is not declared for this project or not enabled",
          }),
        });
        continue;
      }

      const alias = matched.as;

      if (isCallLiveAgentTool(matched.name)) {
        if (!state.liveAgentEnabled) {
          const normalized = {
            offered: false,
            error: "Live agent is not enabled for this project",
          };
          toolAudit.push(
            auditFailTool(
              matched.name,
              alias,
              "Live agent is not enabled",
              callArgs,
            ),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        if (state.liveAgentResilience === "never") {
          const normalized = { offered: false };
          logLiveAgentHandoffDecision({
            resilience: "never",
            args: parseLiveAgentHandoffArgs(callArgs),
            allowed: false,
            reason: "never",
          });
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        if (!toolGuardService.canEmit(state.sessionId, "live_agent")) {
          const normalized = { offered: false };
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        const handoffArgs = parseLiveAgentHandoffArgs(callArgs);
        if (!handoffArgs) {
          const normalized = {
            offered: false,
            instruction: LIVE_AGENT_HANDOFF_DENY_INSTRUCTION,
          };
          logLiveAgentHandoffDecision({
            resilience: state.liveAgentResilience,
            args: null,
            allowed: false,
            reason: "invalid_args",
          });
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        const allowed = shouldAllowLiveAgentHandoff(
          state.liveAgentResilience,
          handoffArgs,
        );
        if (!allowed) {
          const normalized = {
            offered: false,
            instruction: LIVE_AGENT_HANDOFF_DENY_INSTRUCTION,
          };
          logLiveAgentHandoffDecision({
            resilience: state.liveAgentResilience,
            args: handoffArgs,
            allowed: false,
            reason: "sanity_deny",
          });
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        emitStatus(statusLabelForTool(matched));
        const normalized = { offered: true };
        logLiveAgentHandoffDecision({
          resilience: state.liveAgentResilience,
          args: handoffArgs,
          allowed: true,
          reason: "allowed",
        });
        offerLiveAgent = true;
        emitLiveUi();
        bindings = { ...bindings, [alias]: normalized };
        toolAudit.push(auditOkTool(matched.name, alias, normalized, callArgs));
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(normalized),
        });
        continue;
      }

      if (isBookMeetingToolName(matched.name)) {
        handledBookMeetingTool = true;
        const topicId = matched.meetingTopicId;
        if (!state.meetingToolEnabled || !topicId) {
          const normalized = {
            error: "Meeting Tool is not available for this project",
          };
          toolAudit.push(
            auditFailTool(
              matched.name,
              alias,
              "Meeting Tool is not available",
              callArgs,
            ),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        const alreadyBooked = state.sessionMeetings.some(
          (meeting) => meeting.meetingTopicId === topicId,
        );
        if (alreadyBooked) {
          const normalized = { presented: false, alreadyBooked: true };
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        if (!toolGuardService.canEmit(state.sessionId, "booking_prompt")) {
          const normalized = { presented: false };
          toolAudit.push(
            auditOkTool(matched.name, alias, normalized, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        emitStatus(statusLabelForTool(matched));
        const normalized = { presented: true };
        presentMeetingBooking = true;
        meetingBookingTopicId = topicId;
        emitMeetingUi(topicId, matched.title);
        bindings = { ...bindings, [alias]: normalized };
        toolAudit.push(auditOkTool(matched.name, alias, normalized, callArgs));
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(normalized),
        });
        continue;
      }

      if (
        isRecordLeadFieldsTool(matched.name) ||
        isSubmitLeadTool(matched.name)
      ) {
        if (!state.leadCaptureEnabled || !userId || !apiKeyId) {
          const normalized = {
            error: "Lead Capture is not enabled for this project",
          };
          toolAudit.push(
            auditFailTool(
              matched.name,
              alias,
              "Lead Capture is not enabled",
              callArgs,
            ),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(normalized),
          });
          continue;
        }
        try {
          emitStatus(statusLabelForTool(matched));
          const qualification = callArgs.qualification;
          const result = await leadCaptureService.applyAgentAction(
            userId,
            apiKeyId,
            {
              sessionId: state.sessionId,
              action: isSubmitLeadTool(matched.name) ? "submit" : "record",
              fields: leadFieldArgs(callArgs),
              qualification:
                qualification === "lead" ||
                qualification === "qualified" ||
                qualification === "hot"
                  ? qualification
                  : undefined,
              summary:
                typeof callArgs.summary === "string"
                  ? callArgs.summary
                  : undefined,
            },
          );
          bindings = { ...bindings, [alias]: result };
          toolAudit.push(auditOkTool(matched.name, alias, result, callArgs));
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Lead capture failed";
          toolAudit.push(
            auditFailTool(matched.name, alias, message, callArgs),
          );
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ error: message }),
          });
        }
        continue;
      }

      const mcpArgs = mergeSapAiToolArgs(callArgs, state);
      try {
        emitStatus(statusLabelForTool(matched));
        const invoked = await mcpService.callEnabledTool(
          userId,
          apiKeyId,
          matched.name,
          mcpArgs,
        );
        const normalized = normalizeToolResult(invoked.result);
        if (!invoked.isError) {
          bindings = { ...bindings, [alias]: normalized };
        }
        const uiShown = await emitToolUi(
          matched.name,
          normalized,
          invoked.isError,
        );
        toolAudit.push(
          invoked.isError
            ? auditFailTool(
                matched.name,
                alias,
                "MCP tool returned an error",
                mcpArgs,
              )
            : auditOkTool(matched.name, alias, normalized, mcpArgs),
        );
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: toolResultContentWithUiHint(
            invoked.isError
              ? { error: true, result: normalized }
              : normalized,
            uiShown,
          ),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Tool call failed";
        toolAudit.push(auditFailTool(matched.name, alias, message, mcpArgs));
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify({ error: message }),
        });
      }
    }

    // Tool-call turns often already wrote the user-facing reply. Another
    // round repeats it (and can leak thinking tags). Keep the first copy.
    if (
      (presentMeetingBooking || offerLiveAgent || handledBookMeetingTool) &&
      turn.text.trim()
    ) {
      responseText = turn.text.trim();
      responseReasoning = turn.reasoningContent ?? "";
      break;
    }

    // Rebuild system context with fresh bindings for the next model turn.
    const prefix = buildLlmMessages(state, bindings);
    const suffix = messages.filter(
      (m) => m.role === "assistant" || m.role === "tool",
    );
    messages = withToolUiShownSystemHint([...prefix, ...suffix]);
    emitStatus("Drafting an answer");
  }

  if (!responseText) {
    // Final forced answer without tools if the loop exhausted on tool calls.
    emitStatus("Drafting an answer");
    const turn = await streamAgentTurn(
      withToolUiShownSystemHint(buildLlmMessages(state, bindings)),
      [],
      onToken,
    );
    responseText = turn.text;
    responseReasoning = turn.reasoningContent ?? "";
  }

  return {
    responseText,
    responseReasoningContent: responseReasoning,
    llmMessages: messages,
    toolBindings: bindings,
    offerLiveAgent,
    presentMeetingBooking,
    meetingBookingTopicId,
    resolvedReferences: {
      topics: state.resolvedReferences?.topics ?? [],
      tools: toolAudit,
    },
  };
}

async function updateMemory(
  state: AgentTurnState,
): Promise<Partial<AgentTurnState>> {
  if (state.skipMemoryUpdates) {
    return {};
  }

  if (
    !Types.ObjectId.isValid(state.sessionId) ||
    !Types.ObjectId.isValid(state.userId) ||
    !Types.ObjectId.isValid(state.apiKeyId)
  ) {
    return {};
  }

  try {
    const existing =
      state.memories.length > 0
        ? `\nExisting session memory:\n${formatMemories(state.memories)}\n`
        : "\nExisting session memory: (none)\n";

    const raw = await completeChat(
      [
        { role: "system", content: MEMORY_EXTRACT_PROMPT },
        {
          role: "user",
          content: `${existing}\nLatest user message:\n${state.userMessage}\n\nAssistant reply:\n${state.responseText}`,
        },
      ],
      state,
    );

    const updates = parseMemoryUpdates(raw);
    if (
      !updates ||
      (updates.upserts.length === 0 && updates.deletes.length === 0)
    ) {
      return {};
    }

    const written = await applyMemoryUpdates(
      new Types.ObjectId(state.sessionId),
      new Types.ObjectId(state.userId),
      new Types.ObjectId(state.apiKeyId),
      updates,
    );

    if (written.length === 0) {
      return {};
    }

    const memoryKeysTouched = [
      ...new Set([...state.memoryKeysTouched, ...written]),
    ];
    return { memoryKeysTouched };
  } catch {
    // ponytail: memory must never break the chat turn
    return {};
  }
}

export type AgentPipelineEvent =
  | { type: "token"; text: string }
  | { type: "status"; step: string }
  | { type: "values"; state: AgentTurnState }
  | {
      type: "tool_ui";
      kind: "live_agent" | "meeting";
      meetingTopicId?: string;
      topicName?: string;
    }
  | {
      type: "ui";
      format: "ui" | "openui";
      payload: unknown;
      renderMode?: "deterministic" | "auto";
    };

function statusLabelForTool(tool: {
  name: string;
  as: string;
  title?: string;
}): string {
  if (isCallLiveAgentTool(tool.name)) {
    return "Connecting to a live agent";
  }
  if (isBookMeetingToolName(tool.name)) {
    return tool.title
      ? `Preparing meeting booking: ${tool.title}`
      : "Preparing meeting booking";
  }
  if (isRecordLeadFieldsTool(tool.name)) {
    return "Recording lead details";
  }
  if (isSubmitLeadTool(tool.name)) {
    return "Submitting lead";
  }
  // Keep MCP tool names out of the streamed thinking trail.
  return "Calling tools";
}

export async function* runAgentPipeline(
  initial: AgentTurnState,
): AsyncGenerator<AgentPipelineEvent> {
  let state: AgentTurnState = { ...initial };
  const merge = (update: Partial<AgentTurnState>) => {
    state = { ...state, ...update };
  };

  merge(await loadMemory(state));
  yield { type: "status", step: "Reading the question" };
  merge(await decideRetrieval(state));
  if (state.shouldRetrieve) {
    yield { type: "status", step: "Searching relevant information" };
  }
  merge(await retrieveKnowledge(state));
  merge(await loadRetrievedTopicTools(state));
  merge(prepareMessages(state));
  yield { type: "values", state };
  yield { type: "status", step: "Drafting an answer" };

  const pending: string[] = [];
  const pendingStatus: string[] = [];
  const pendingToolUi: Array<{
    kind: "live_agent" | "meeting";
    meetingTopicId?: string;
    topicName?: string;
  }> = [];
  const pendingUiDesc: Array<{
    payload: unknown;
    renderMode: "deterministic" | "auto";
  }> = [];
  let genDone = false;
  let wake: (() => void) | undefined;
  const notify = () => wake?.();

  const genPromise = generateResponse(
    state,
    (token) => {
      pending.push(token);
      notify();
    },
    (ui) => {
      pendingToolUi.push(ui);
      notify();
    },
    (event) => {
      pendingUiDesc.push(event);
      notify();
    },
    (step) => {
      pendingStatus.push(step);
      notify();
    },
  ).then((update) => {
    merge(update);
    genDone = true;
    notify();
  });

  while (
    !genDone ||
    pending.length > 0 ||
    pendingStatus.length > 0 ||
    pendingToolUi.length > 0 ||
    pendingUiDesc.length > 0
  ) {
    while (pendingStatus.length > 0) {
      yield { type: "status", step: pendingStatus.shift()! };
    }
    while (pendingToolUi.length > 0) {
      const ui = pendingToolUi.shift()!;
      yield { type: "tool_ui", ...ui };
    }
    while (pendingUiDesc.length > 0) {
      const event = pendingUiDesc.shift()!;
      yield {
        type: "ui",
        format: "ui",
        payload: event.payload,
        renderMode: event.renderMode,
      };
    }
    while (pending.length > 0) {
      yield { type: "token", text: pending.shift()! };
    }
    if (!genDone) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }
  await genPromise;

  merge(await updateMemory(state));
  yield { type: "values", state };
}

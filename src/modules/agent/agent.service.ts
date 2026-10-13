import crypto from "crypto";
import { Types } from "mongoose";
import type { AgentInfluenceDto, AgentTurnEvent } from "../../dto/agent.dto";
import type { GuidanceAgentItemDto } from "../../dto/guidance.dto";
import type { LlmChatConfig } from "../../llm/types";
import { ArticleModel } from "../../models/article/article.model";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import type {
  ChatMessageInterface,
  MessageContentBlock,
  MessageContextInfluence,
} from "../../models/message/message.interface";
import { ChatMessageModel } from "../../models/message/message.model";
import { TopicModel } from "../../models/topic/topic.model";
import { chatWithQuota } from "../../llm/chatWithQuota";
import { DEEPSEEK_CHAT_MODEL } from "../../llm/deepseek/deepseekClient";
import { OLLAMA_CHAT_MODEL } from "../../llm/ollama/ollamaClient";
import { entitlementService } from "../entitlement/entitlement.service";
import { runAgentPipeline } from "./agent.graph";
import { deleteMemoriesForSession } from "./agent.memory";
import { AgentMemoryModel } from "../../models/agentMemory/agentMemory.model";
import { toLlmHistory } from "./agent.messages";
import {
  CONVERSATION_RESOLVED_MARKER,
  LIVE_AGENT_OFFER_MARKER,
  LIVE_AGENT_OFFER_MESSAGE,
  meetingBookingMarkerRe,
  stripModelLeakTags,
} from "./agent.prompts";
import type {
  AgentResolvedReferences,
  AgentResolvedTopicRef,
  AgentVisitorIdentity,
  RetrievedChunk,
} from "./agent.state";
import { CHAT_SESSION_TTL_MS, widgetService } from "../widget/widget.service";
import { meetingToolService } from "../meetingTool/meetingTool.service";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import type { LiveAgentResilience } from "../../dto/liveAgent.dto";
import type { SessionMeetingFactDto } from "../../dto/meeting.dto";
import type { MeetingBookingPayloadDto } from "../../dto/meetingTool.dto";
import { logger } from "../../logger/logger";
import type { AgentExecutionMode } from "../../models/message/messageAnalytics.types";
import { chatAnalyticsService } from "../chatAnalytics/chatAnalytics.service";
import { widgetAnalyticsService } from "../widgetAnalytics/widgetAnalytics.service";
import { toolGuardService } from "../toolGuard/toolGuard.service";
import { verifyPublicSessionId } from "../../utils/publicSessionToken";
import {
  fromLlmImageHandles,
  type ImageHandle,
} from "../../utils/agentImageHandles";
import { LIVE_AGENT_HANDOFF_DEFER_MESSAGE, LIVE_AGENT_NEVER_FALLBACK_MESSAGE } from "./liveAgentHandoff";

function normalizeLiveAgentResilience(value: unknown): LiveAgentResilience {
  if (value === "low" || value === "high" || value === "never") return value;
  return "medium";
}

const HISTORY_LIMIT = 40;
const CHUNK_PREVIEW_LEN = 120;
const MEETING_BOOKING_MARKER_OPEN = "[[MEETING_BOOKING:";
const DENIED_TOOL_FALLBACK = "How else can I help?";

function tidyMarkerWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** Official marker plus the short form models invent when the tool is missing. */
const LIVE_AGENT_MARKER_RE = /\[\[LIVE_AGENT(?:_OFFER)?\]\]/gi;

function stripLiveAgentOfferMarker(text: string): {
  cleaned: string;
  offered: boolean;
} {
  const offered = LIVE_AGENT_MARKER_RE.test(text);
  LIVE_AGENT_MARKER_RE.lastIndex = 0;
  const cleaned = tidyMarkerWhitespace(text.replace(LIVE_AGENT_MARKER_RE, ""));
  return { cleaned, offered };
}

function stripConversationResolvedMarker(text: string): {
  cleaned: string;
  resolved: boolean;
} {
  const resolved = text.includes(CONVERSATION_RESOLVED_MARKER);
  const cleaned = tidyMarkerWhitespace(
    text.replaceAll(CONVERSATION_RESOLVED_MARKER, ""),
  );
  return { cleaned, resolved };
}

function stripMeetingBookingMarker(text: string): {
  cleaned: string;
  slug: string | null;
} {
  let slug: string | null = null;
  const cleaned = tidyMarkerWhitespace(
    text.replace(meetingBookingMarkerRe(), (_match, captured: string) => {
      if (!slug && typeof captured === "string" && captured.trim()) {
        slug = captured.trim().toLowerCase();
      }
      return "";
    }),
  );
  return { cleaned, slug };
}

function topicAlreadyBooked(
  meetings: SessionMeetingFactDto[],
  topicId: string | null | undefined,
): boolean {
  return Boolean(
    topicId && meetings.some((meeting) => meeting.meetingTopicId === topicId),
  );
}

/** Strip complete markers and hold back an incomplete marker / image-token suffix. */
function visibleAssistantStreamText(
  raw: string,
  imageHandles: ImageHandle[],
): string {
  let cut = raw;

  const lastMustache = cut.lastIndexOf("{{");
  if (lastMustache >= 0 && !cut.slice(lastMustache).includes("}}")) {
    cut = cut.slice(0, lastMustache);
  } else if (cut.endsWith("{")) {
    cut = cut.slice(0, -1);
  }

  for (let i = LIVE_AGENT_OFFER_MARKER.length - 1; i >= 1; i -= 1) {
    const prefix = LIVE_AGENT_OFFER_MARKER.slice(0, i);
    if (cut.endsWith(prefix) && !cut.endsWith(LIVE_AGENT_OFFER_MARKER)) {
      cut = cut.slice(0, -prefix.length);
      break;
    }
  }
  for (let i = CONVERSATION_RESOLVED_MARKER.length - 1; i >= 1; i -= 1) {
    const prefix = CONVERSATION_RESOLVED_MARKER.slice(0, i);
    if (cut.endsWith(prefix) && !cut.endsWith(CONVERSATION_RESOLVED_MARKER)) {
      cut = cut.slice(0, -prefix.length);
      break;
    }
  }

  const lastOpen = cut.lastIndexOf("[[");
  if (lastOpen >= 0 && !cut.slice(lastOpen).includes("]]")) {
    const frag = cut.slice(lastOpen).toUpperCase();
    if (
      LIVE_AGENT_OFFER_MARKER.startsWith(cut.slice(lastOpen)) ||
      CONVERSATION_RESOLVED_MARKER.startsWith(cut.slice(lastOpen)) ||
      MEETING_BOOKING_MARKER_OPEN.startsWith(cut.slice(lastOpen)) ||
      frag.startsWith("[[MEETING_BOOKING")
    ) {
      cut = cut.slice(0, lastOpen);
    }
  }

  return fromLlmImageHandles(
    stripModelLeakTags(
      stripConversationResolvedMarker(
        stripMeetingBookingMarker(stripLiveAgentOfferMarker(cut).cleaned)
          .cleaned,
      ).cleaned,
    ),
    imageHandles,
  );
}

const emptyContext = (): MessageContextInfluence => ({
  topicIds: [],
  guidanceIds: [],
  chunkIds: [],
  articleIds: [],
});

const emptyInfluence = (): AgentInfluenceDto => ({
  topics: [],
  articles: [],
  chunks: [],
  guidances: [],
  tools: [],
  declaredTools: [],
});

const emptyResolvedReferences = (): AgentResolvedReferences => ({
  topics: [],
  tools: [],
});

const DEFAULT_TEMPERATURE = 0.2;

async function llmConfigForTurn(
  executionMode: AgentExecutionMode | undefined,
  userId: Types.ObjectId,
): Promise<LlmChatConfig> {
  // Test chats stay on Ollama. Widget and WhatsApp follow chatWithQuota.
  if (
    (executionMode === "real" || executionMode === "whatsapp") &&
    (await entitlementService.shouldUseDeepseek(userId))
  ) {
    return {
      provider: "deepseek",
      name: DEEPSEEK_CHAT_MODEL,
      temperature: DEFAULT_TEMPERATURE,
    };
  }
  return {
    provider: "ollama",
    name: OLLAMA_CHAT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
  };
}

const FOLLOWUP_MAX = 3;
const FOLLOWUP_MAX_LEN = 120;

function parseFollowupQuestions(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  const candidate =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const question = item.trim().replace(/\s+/g, " ");
      if (!question || question.length > FOLLOWUP_MAX_LEN) continue;
      out.push(question);
      if (out.length >= FOLLOWUP_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function generateFollowupQuestions(
  userId: Types.ObjectId,
  userMessage: string,
  assistantReply: string,
): Promise<string[]> {
  const reply = assistantReply.trim();
  if (!reply) return [];

  try {
    const text = await chatWithQuota({
      userId,
      messages: [
        {
          role: "system",
          content:
            "Suggest follow-up questions a website visitor might ask next after this chat turn. " +
            `Return ONLY a JSON array of ${FOLLOWUP_MAX} short strings. No markdown, no commentary.`,
        },
        {
          role: "user",
          content: `Visitor asked:\n${userMessage.trim().slice(0, 1000)}\n\nAgent replied:\n${reply.slice(0, 2000)}`,
        },
      ],
      temperature: 0.4,
      logSource: "modules/agent/agent.service.ts",
    });
    return parseFollowupQuestions(text);
  } catch {
    return [];
  }
}

function uniqueObjectIds(ids: Array<string | undefined>): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    if (!id || !Types.ObjectId.isValid(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(new Types.ObjectId(id));
  }
  return out;
}

function contextFromTurn(
  chunks: RetrievedChunk[],
  guidances: GuidanceAgentItemDto[],
  resolvedTopics: AgentResolvedTopicRef[],
): MessageContextInfluence {
  return {
    topicIds: uniqueObjectIds([
      ...chunks.map((chunk) => chunk.topicId),
      ...resolvedTopics.map((topic) => topic.id),
    ]),
    guidanceIds: uniqueObjectIds(guidances.map((guidance) => guidance.id)),
    chunkIds: uniqueObjectIds(chunks.map((chunk) => chunk.chunkId)),
    articleIds: uniqueObjectIds([
      ...chunks.map((chunk) => chunk.articleId),
      ...resolvedTopics.map((topic) => topic.articleId),
    ]),
  };
}

function assistantContent(
  text: string,
  uiPayload?: unknown,
): MessageContentBlock[] {
  const blocks: MessageContentBlock[] = [{ type: "text", content: text }];
  if (uiPayload != null) {
    blocks.push({ type: "ui", format: "ui", payload: uiPayload });
  }
  return blocks;
}

function previewText(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (trimmed.length <= CHUNK_PREVIEW_LEN) return trimmed;
  return `${trimmed.slice(0, CHUNK_PREVIEW_LEN)}…`;
}

async function resolveInfluence(
  chunks: RetrievedChunk[],
  guidances: GuidanceAgentItemDto[],
  resolvedTopics: AgentResolvedTopicRef[],
  resolvedTools: AgentResolvedReferences["tools"] = [],
  declaredTools: Array<{ name: string; alias: string }> = [],
): Promise<AgentInfluenceDto> {
  const guidanceDtos = guidances.map((guidance) => ({
    id: guidance.id,
    name: guidance.title,
  }));
  const toolDtos = resolvedTools.map((tool) => ({
    name: tool.name,
    alias: tool.alias,
    ok: tool.ok,
    ...(tool.error ? { error: tool.error } : {}),
    ...(tool.arguments !== undefined ? { arguments: tool.arguments } : {}),
    ...(tool.result !== undefined ? { result: tool.result } : {}),
  }));
  const declaredDtos = declaredTools.map((tool) => ({
    name: tool.name,
    alias: tool.alias,
  }));

  const topicIds = uniqueObjectIds([
    ...chunks.map((chunk) => chunk.topicId),
    ...resolvedTopics.map((topic) => topic.id),
  ]);
  const articleIds = uniqueObjectIds([
    ...chunks.map((chunk) => chunk.articleId),
    ...resolvedTopics.map((topic) => topic.articleId),
  ]);

  if (topicIds.length === 0 && articleIds.length === 0) {
    return {
      ...emptyInfluence(),
      guidances: guidanceDtos,
      tools: toolDtos,
      declaredTools: declaredDtos,
    };
  }

  const resolvedById = new Map(
    resolvedTopics.map((topic) => [topic.id.toLowerCase(), topic]),
  );

  const [topics, articles] = await Promise.all([
    topicIds.length
      ? TopicModel.find({ _id: { $in: topicIds } })
          .select({ topicName: 1, articleId: 1 })
          .lean<
            Array<{
              _id: Types.ObjectId;
              topicName: string;
              articleId?: Types.ObjectId;
            }>
          >()
      : Promise.resolve([]),
    articleIds.length
      ? ArticleModel.find({ _id: { $in: articleIds } })
          .select({ title: 1 })
          .lean<Array<{ _id: Types.ObjectId; title: string }>>()
      : Promise.resolve([]),
  ]);

  const topicById = new Map(
    topics.map((topic) => [
      topic._id.toString(),
      {
        name: topic.topicName,
        articleId: topic.articleId?.toString() ?? "",
      },
    ]),
  );
  for (const topic of resolvedTopics) {
    if (!topicById.has(topic.id)) {
      topicById.set(topic.id, {
        name: topic.name,
        articleId: topic.articleId,
      });
    }
  }

  const articleTitleById = new Map(
    articles.map((article) => [article._id.toString(), article.title]),
  );

  const seenChunk = new Set<string>();
  const chunkDtos: AgentInfluenceDto["chunks"] = [];
  for (const chunk of chunks) {
    if (seenChunk.has(chunk.chunkId)) continue;
    seenChunk.add(chunk.chunkId);
    chunkDtos.push({
      id: chunk.chunkId,
      topicId: chunk.topicId,
      articleId: chunk.articleId ?? "",
      preview: previewText(chunk.content),
    });
  }

  return {
    topics: topicIds.map((id) => {
      const key = id.toString();
      const topic =
        topicById.get(key) ?? resolvedById.get(key.toLowerCase());
      return {
        id: key,
        name: topic?.name ?? key,
        articleId:
          topic?.articleId ??
          chunks.find((chunk) => chunk.topicId === key)?.articleId ??
          "",
      };
    }),
    articles: articleIds.map((id) => {
      const key = id.toString();
      return {
        id: key,
        title: articleTitleById.get(key) ?? key,
      };
    }),
    chunks: chunkDtos,
    guidances: guidanceDtos,
    tools: toolDtos,
    declaredTools: declaredDtos,
  };
}

async function assertOwnedSession(
  sessionId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
) {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    apiKeyId,
  }).lean();

  if (!session) {
    throw new Error("Chat session not found");
  }

  if (session.expiredAt.getTime() <= Date.now()) {
    await Promise.all([
      ChatSessionModel.deleteOne({ _id: session._id }),
      deleteMemoriesForSession(session._id),
    ]);
    throw new Error("Chat session expired");
  }

  return session;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}

async function forgetWhatsAppSession(sessionId: Types.ObjectId): Promise<void> {
  await Promise.all([
    ChatSessionModel.deleteOne({ _id: sessionId }),
    ChatMessageModel.deleteMany({ sessionId }),
    deleteMemoriesForSession(sessionId),
  ]);
}

async function whatsAppSession(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  chatId: string,
): Promise<Types.ObjectId> {
  const existing = await ChatSessionModel.findOne({
    apiKeyId,
    whatsAppChatId: chatId,
  });
  if (existing && existing.expiredAt.getTime() > Date.now()) {
    return existing._id;
  }
  if (existing) {
    await forgetWhatsAppSession(existing._id);
  }

  const expiredAt = new Date(Date.now() + CHAT_SESSION_TTL_MS);
  try {
    const created = await ChatSessionModel.create({
      publicKey: "whatsapp",
      userId,
      apiKeyId,
      visitorAuthMode: "anonymous",
      visitor: null,
      whatsAppChatId: chatId,
      expiredAt,
    });
    return created._id;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const raced = await ChatSessionModel.findOne({
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (raced && raced.expiredAt.getTime() > Date.now()) return raced._id;
    throw error;
  }
}

async function slideWhatsAppSession(sessionId: Types.ObjectId): Promise<void> {
  const now = new Date();
  await ChatSessionModel.updateOne(
    { _id: sessionId, expiredAt: { $gt: now } },
    { $set: { expiredAt: new Date(now.getTime() + CHAT_SESSION_TTL_MS) } },
  );
}

export class AgentService {
  /**
   * Core streaming turn: persist user message, stream tokens, persist assistant.
   * Controllers should consume this AsyncGenerator (e.g. SSE)    no HTTP here.
   *
   * When `isolated` is true (batch testing): no ChatSession is required or created,
   * messages are not persisted, history is empty, and any ephemeral memory is cleaned up.
   */
  async *runAgentTurn(params: {
    sessionId?: Types.ObjectId;
    userId: Types.ObjectId;
    apiKeyId: Types.ObjectId;
    message: string;
    visitor?: AgentVisitorIdentity;
    isolated?: boolean;
    /** Defaults to "test". Only "real" (widget) may enqueue analytics. */
    executionMode?: AgentExecutionMode;
    /** Aborts in-flight Ollama calls. Used by batch-test question timeout. */
    signal?: AbortSignal;
  }): AsyncGenerator<AgentTurnEvent> {
    const message = params.message.trim();
    if (!message) {
      throw new Error("Message is required");
    }

    const isolated = params.isolated === true;
    const sessionId = isolated
      ? new Types.ObjectId()
      : params.sessionId;
    if (!sessionId) {
      throw new Error("Chat session not found");
    }

    if (!isolated) {
      await assertOwnedSession(sessionId, params.apiKeyId);
    }

    const priorDocs = isolated
      ? []
      : await ChatMessageModel.find({
          sessionId,
        })
          .sort({ createdAt: 1 })
          .limit(HISTORY_LIMIT)
          .lean<ChatMessageInterface[]>();

    const history = toLlmHistory(priorDocs);
    const runId = crypto.randomUUID();
    const llmConfig = await llmConfigForTurn(
      params.executionMode,
      params.userId,
    );
    const visitor: AgentVisitorIdentity = params.visitor ?? null;

    const apiKey = await ApiKeyModel.findById(params.apiKeyId).lean();
    const projectLiveAgentEnabled =
      apiKey?.liveAgentSetting?.enabled === true;
    const planLiveAgentEnabled = await entitlementService.hasLiveAgent(
      params.userId,
      params.apiKeyId,
    );
    const liveAgentEnabled = projectLiveAgentEnabled && planLiveAgentEnabled;
    const enhancedRetrieval = apiKey?.enhancedRetrieval === true;
    const liveAgentResilience = normalizeLiveAgentResilience(
      apiKey?.liveAgentSetting?.resilience,
    );
    const enabledMeetingTopics =
      await meetingToolService.listEnabledTopicsForAgent(
        params.userId,
        params.apiKeyId,
      );
    const meetingToolEnabled = enabledMeetingTopics.length > 0;
    const meetingTopicBySlug = new Map(
      enabledMeetingTopics.map((topic) => [
        topic.slug.toLowerCase(),
        topic,
      ]),
    );
    const meetingTopicById = new Map(
      enabledMeetingTopics.map((topic) => [topic.id, topic]),
    );

    let userMessageId: Types.ObjectId | undefined;
    let assistantMessageId: Types.ObjectId | undefined;

    if (!isolated) {
      if (params.executionMode === "real") {
        const priorUser = await ChatMessageModel.countDocuments({
          sessionId,
          role: "user",
        });
        if (priorUser === 0) {
          void widgetAnalyticsService.recordChatUsed(
            params.userId,
            params.apiKeyId,
          );
        }
      }
      const userMessage = await ChatMessageModel.create({
        sessionId,
        role: "user",
        content: [{ type: "text", content: message }],
        context: emptyContext(),
        runId,
        memoryKeys: [],
        metadata: {},
      });
      userMessageId = userMessage._id;
    }

    let fullResponse = "";
    let responseReasoningContent = "";
    let retrievedChunks: RetrievedChunk[] = [];
    let memoryKeysTouched: string[] = [];
    let guidances: GuidanceAgentItemDto[] = [];
    let resolvedReferences = emptyResolvedReferences();
    let declaredTools: Array<{ name: string; alias: string }> = [];
    let offerLiveAgent = false;
    let presentMeetingBooking = false;
    let meetingBookingTopicId: string | null = null;
    let sessionMeetings: SessionMeetingFactDto[] = [];
    let emittedLiveToolUi = false;
    let emittedMeetingToolUi = false;
    let lastUiPayload: unknown = null;
    let lastUiRenderMode: "deterministic" | "auto" | null = null;
    let imageHandles: ImageHandle[] = [];

    try {
      let streamedVisible = "";

      for await (const event of runAgentPipeline({
        sessionId: sessionId.toString(),
        runId,
        userId: params.userId.toString(),
        apiKeyId: params.apiKeyId.toString(),
        userMessage: message,
        history,
        shouldRetrieve: false,
        retrievalQuery: "",
        retrievalQueries: [],
        retrievedChunks: [],
        memories: [],
        sessionMeetings: [],
        memoryKeysTouched: [],
        guidances: [],
        resolvedReferences: emptyResolvedReferences(),
        declaredTools: [],
        toolBindings: {},
        llmMessages: [],
        responseText: "",
        llmConfig,
        visitor,
        liveAgentEnabled,
        enhancedRetrieval,
        liveAgentResilience,
        offerLiveAgent: false,
        meetingToolEnabled,
        presentMeetingBooking: false,
        meetingBookingTopicId: null,
        leadCaptureEnabled: false,
        leadCaptureBrief: "",
        skipMemoryUpdates: isolated,
        imageHandles: [],
        signal: params.signal,
      })) {
        if (event.type === "tool_ui") {
          if (event.kind === "live_agent" && liveAgentEnabled) {
            if (
              !toolGuardService.canEmit(sessionId.toString(), "live_agent")
            ) {
              continue;
            }
            emittedLiveToolUi = true;
            yield {
              type: "tool_ui",
              kind: "live_agent",
              status: "loading",
            };
          } else if (event.kind === "meeting" && meetingToolEnabled) {
            if (topicAlreadyBooked(sessionMeetings, event.meetingTopicId)) {
              continue;
            }
            if (
              !toolGuardService.canEmit(
                sessionId.toString(),
                "booking_prompt",
              )
            ) {
              continue;
            }
            emittedMeetingToolUi = true;
            const topic = event.meetingTopicId
              ? meetingTopicById.get(event.meetingTopicId)
              : undefined;
            yield {
              type: "tool_ui",
              kind: "meeting",
              status: "loading",
              ...(event.meetingTopicId
                ? { meetingTopicId: event.meetingTopicId }
                : {}),
              topicName: event.topicName ?? topic?.name,
            };
          }
          continue;
        }

        if (event.type === "ui") {
          lastUiPayload = event.payload;
          lastUiRenderMode = event.renderMode ?? "deterministic";
          yield {
            type: "ui",
            format: event.format,
            payload: event.payload,
          };
          continue;
        }

        if (event.type === "status" && event.step) {
          yield { type: "status", step: event.step };
          continue;
        }

        if (event.type === "token" && event.text) {
          fullResponse += event.text;
          const visible = visibleAssistantStreamText(
            fullResponse,
            imageHandles,
          );
          const toYield = visible.slice(streamedVisible.length);
          streamedVisible = visible;
          if (toYield) yield { type: "token", text: toYield };
          continue;
        }

        if (event.type === "values") {
          const values = event.state;
          if (Array.isArray(values.retrievedChunks)) {
            retrievedChunks = values.retrievedChunks;
          }
          if (Array.isArray(values.memoryKeysTouched)) {
            memoryKeysTouched = values.memoryKeysTouched;
          }
          if (Array.isArray(values.guidances)) {
            guidances = values.guidances;
          }
          if (
            values.resolvedReferences &&
            Array.isArray(values.resolvedReferences.topics)
          ) {
            resolvedReferences = values.resolvedReferences;
          }
          if (Array.isArray(values.declaredTools)) {
            declaredTools = values.declaredTools.map((tool) => ({
              name: tool.name,
              alias: tool.as,
            }));
          }
          if (Array.isArray(values.imageHandles)) {
            imageHandles = values.imageHandles;
          }
          if (Array.isArray(values.sessionMeetings)) {
            sessionMeetings = values.sessionMeetings;
          }
          if (typeof values.responseReasoningContent === "string") {
            responseReasoningContent = values.responseReasoningContent;
          }
          if (values.offerLiveAgent === true) {
            offerLiveAgent = true;
          }
          if (values.presentMeetingBooking === true) {
            presentMeetingBooking = true;
          }
          if (
            typeof values.meetingBookingTopicId === "string" &&
            values.meetingBookingTopicId
          ) {
            meetingBookingTopicId = values.meetingBookingTopicId;
          }
        }
      }
    } catch (error) {
      if (isolated) {
        await deleteMemoriesForSession(sessionId).catch(() => undefined);
      }
      // User message already saved; do not persist a partial assistant reply.
      throw error;
    }

    const { cleaned: afterLive, offered: markerOffered } =
      stripLiveAgentOfferMarker(stripModelLeakTags(fullResponse));
    const { cleaned: afterResolved, resolved: markerResolved } =
      stripConversationResolvedMarker(afterLive);
    const { cleaned: afterMarkers, slug: meetingMarkerSlug } =
      stripMeetingBookingMarker(afterResolved);
    const cleaned = fromLlmImageHandles(afterMarkers, imageHandles);
    const guardSessionId = sessionId.toString();
    let deniedEmission = false;
    let handoffDenied = false;
    const markerHandoffAllowed =
      liveAgentEnabled && liveAgentResilience !== "never";
    let offered = Boolean(
      markerHandoffAllowed && (markerOffered || offerLiveAgent),
    );
    // Never: ignore marker-only handoffs even if the model printed the marker.
    if (
      liveAgentResilience === "never" &&
      markerOffered &&
      !offerLiveAgent
    ) {
      offered = false;
      deniedEmission = true;
      handoffDenied = true;
    }
    if (offered && !toolGuardService.canEmit(guardSessionId, "live_agent")) {
      offered = false;
      deniedEmission = true;
    }
    if (
      meetingToolEnabled &&
      meetingMarkerSlug &&
      !meetingBookingTopicId
    ) {
      const topic = meetingTopicBySlug.get(meetingMarkerSlug);
      if (topic && !topicAlreadyBooked(sessionMeetings, topic.id)) {
        if (toolGuardService.canEmit(guardSessionId, "booking_prompt")) {
          presentMeetingBooking = true;
          meetingBookingTopicId = topic.id;
        } else {
          deniedEmission = true;
        }
      }
    }
    if (topicAlreadyBooked(sessionMeetings, meetingBookingTopicId)) {
      presentMeetingBooking = false;
      meetingBookingTopicId = null;
    }
    if (
      presentMeetingBooking &&
      !toolGuardService.canEmit(guardSessionId, "booking_prompt")
    ) {
      presentMeetingBooking = false;
      meetingBookingTopicId = null;
      deniedEmission = true;
    }

    if (offered && !emittedLiveToolUi) {
      emittedLiveToolUi = true;
      yield {
        type: "tool_ui",
        kind: "live_agent",
        status: "loading",
      };
    }
    if (
      meetingToolEnabled &&
      presentMeetingBooking &&
      meetingBookingTopicId &&
      !emittedMeetingToolUi
    ) {
      emittedMeetingToolUi = true;
      const topic = meetingTopicById.get(meetingBookingTopicId);
      yield {
        type: "tool_ui",
        kind: "meeting",
        status: "loading",
        meetingTopicId: meetingBookingTopicId,
        ...(topic?.name ? { topicName: topic.name } : {}),
      };
    }

    const showMeeting =
      Boolean(meetingToolEnabled && presentMeetingBooking && meetingBookingTopicId);
    let meetingBooking: MeetingBookingPayloadDto | undefined;
    let meetingBookingError: string | undefined;
    if (showMeeting && meetingBookingTopicId) {
      try {
        meetingBooking = await meetingToolService.buildBookingPayload(
          params.userId,
          params.apiKeyId,
          meetingBookingTopicId,
        );
      } catch (error) {
        const errMessage =
          error instanceof Error ? error.message : "buildBookingPayload failed";
        logger.error(errMessage, "agent.service", "runAgentTurn");
        meetingBooking = undefined;
        meetingBookingError = errMessage;
        yield {
          type: "tool_ui",
          kind: "meeting",
          status: "error",
          meetingTopicId: meetingBookingTopicId,
          message: errMessage,
        };
      }
    }

    const persistText = cleaned.trim();
    let requestFeedback = Boolean(markerResolved && !offered);
    if (
      requestFeedback &&
      !toolGuardService.canEmit(guardSessionId, "resolved")
    ) {
      requestFeedback = false;
      deniedEmission = true;
    }
    const offerOnly = Boolean(
      (offered || meetingBooking || requestFeedback) && !persistText,
    );

    if (!persistText && !offerOnly) {
      if (meetingBookingError) {
        if (isolated) {
          await deleteMemoriesForSession(sessionId).catch(() => undefined);
        }
        yield {
          type: "done",
          influence: emptyInfluence(),
        };
        return;
      }
      if (!deniedEmission) {
        if (isolated) {
          await deleteMemoriesForSession(sessionId).catch(() => undefined);
        }
        throw new Error("Agent produced an empty response");
      }
    }

    const assistantText =
      persistText ||
      (!offerOnly && deniedEmission
        ? liveAgentResilience === "never" && handoffDenied
          ? LIVE_AGENT_NEVER_FALLBACK_MESSAGE
          : handoffDenied
            ? LIVE_AGENT_HANDOFF_DEFER_MESSAGE
            : DENIED_TOOL_FALLBACK
        : "");

    if (!isolated && assistantText) {
      const assistantMessage = await ChatMessageModel.create({
        sessionId,
        role: "assistant",
        content: assistantContent(assistantText, lastUiPayload),
        context: contextFromTurn(
          retrievedChunks,
          guidances,
          resolvedReferences.topics,
        ),
        runId,
        memoryKeys: memoryKeysTouched,
        metadata: {
          ...(offered ? { liveAgentOffer: true } : {}),
          ...(meetingBooking ? { meetingBooking: true } : {}),
          ...(responseReasoningContent
            ? { reasoningContent: responseReasoningContent }
            : {}),
          ...(lastUiPayload != null && lastUiRenderMode
            ? { uiRenderMode: lastUiRenderMode }
            : {}),
        },
      });
      assistantMessageId = assistantMessage._id;
    }

    if (isolated) {
      await deleteMemoriesForSession(sessionId).catch(() => undefined);
    }

    if (!persistText && assistantText) {
      yield { type: "token", text: assistantText };
    }

    const influence = await resolveInfluence(
      retrievedChunks,
      guidances,
      resolvedReferences.topics,
      resolvedReferences.tools,
      declaredTools,
    );
    if (offered) {
      toolGuardService.recordEmission(guardSessionId, "live_agent");
    }
    if (meetingBooking) {
      toolGuardService.recordEmission(guardSessionId, "booking_prompt");
    }
    if (requestFeedback) {
      toolGuardService.recordEmission(guardSessionId, "resolved");
    }
    yield {
      type: "done",
      influence,
      ...(offered
        ? {
            liveAgentOffer: {
              message: LIVE_AGENT_OFFER_MESSAGE,
              action: "create_live_agent_ticket" as const,
            },
          }
        : {}),
      ...(meetingBooking ? { meetingBooking } : {}),
      ...(requestFeedback ? { requestFeedback: true } : {}),
      ...(userMessageId
        ? {
            persistedMessageIds: {
              userMessageId: userMessageId.toString(),
              ...(assistantMessageId
                ? { assistantMessageId: assistantMessageId.toString() }
                : {}),
            },
          }
        : {}),
    };
  }

  /**
   * Batch-test entry: same agent pipeline as a normal turn, without ChatSession.
   */
  async *runIsolatedAgentTurn(params: {
    userId: Types.ObjectId;
    apiKeyId: Types.ObjectId;
    message: string;
    signal?: AbortSignal;
  }): AsyncGenerator<AgentTurnEvent> {
    yield* this.runAgentTurn({
      ...params,
      isolated: true,
      executionMode: "test",
    });
  }

  async *whatsAppAgentChat(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    chatId: string,
    message: string,
  ): AsyncGenerator<AgentTurnEvent> {
    const sessionId = await whatsAppSession(userId, apiKeyId, chatId);
    yield* this.runAgentTurn({
      sessionId,
      userId,
      apiKeyId,
      message,
      visitor: null,
      executionMode: "whatsapp",
    });
    await slideWhatsAppSession(sessionId);
  }

  async *testAgentChat(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    message: string,
    sessionId: string,
  ): AsyncGenerator<AgentTurnEvent> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new Error("Chat session not found");
    }

    const sessionObjectId = new Types.ObjectId(sessionId);
    const session = await assertOwnedSession(sessionObjectId, apiKeyId);
    const visitor: AgentVisitorIdentity =
      session.visitorAuthMode === "authenticated" && session.visitor
        ? { sub: session.visitor.sub, claims: session.visitor.claims ?? {} }
        : null;

    yield* this.runAgentTurn({
      sessionId: sessionObjectId,
      userId,
      apiKeyId,
      message,
      visitor,
      executionMode: "test",
    });
  }

  async *widgetAgentChat(
    publicKey: string,
    sessionId: string,
    message: string,
  ): AsyncGenerator<AgentTurnEvent> {
    const trimmedKey = publicKey.trim();
    if (!trimmedKey) {
      throw new Error("Widget not found");
    }
    const canonicalSessionId = verifyPublicSessionId(trimmedKey, sessionId);

    let session;
    try {
      session = await widgetService.assertPublicSessionCanChat(
        trimmedKey,
        sessionId,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Chat session expired"
      ) {
        await deleteMemoriesForSession(new Types.ObjectId(canonicalSessionId));
      }
      throw error;
    }

    const widget = await widgetService.getByPublicKey(trimmedKey);
    const enableFollowups =
      widget.chatSettings.enableFollowupQuestions === true;

    const visitor: AgentVisitorIdentity =
      session.visitorAuthMode === "authenticated" && session.visitor
        ? { sub: session.visitor.sub, claims: session.visitor.claims ?? {} }
        : null;

    let assistantText = "";
    let persistedUserMessageId: string | undefined;
    let persistedAssistantMessageId: string | undefined;
    let turnTools: Array<{ name: string; ok: boolean }> = [];

    for await (const event of this.runAgentTurn({
      sessionId: session._id,
      userId: session.userId,
      apiKeyId: session.apiKeyId,
      message,
      visitor,
      executionMode: "real",
    })) {
      if (event.type === "token") {
        assistantText += event.text;
        yield event;
        continue;
      }

      if (event.type === "done") {
        if (event.persistedMessageIds?.userMessageId) {
          persistedUserMessageId = event.persistedMessageIds.userMessageId;
          persistedAssistantMessageId =
            event.persistedMessageIds.assistantMessageId;
        }
        turnTools = event.influence.tools.map((tool) => ({
          name: tool.name,
          ok: tool.ok,
        }));

        if (enableFollowups) {
          // Unlock the client as soon as the reply finishes; suggestions follow.
          yield {
            type: "done",
            influence: event.influence,
            ...(event.liveAgentOffer
              ? { liveAgentOffer: event.liveAgentOffer }
              : {}),
            ...(event.meetingBooking
              ? { meetingBooking: event.meetingBooking }
              : {}),
            ...(event.requestFeedback ? { requestFeedback: true } : {}),
          };

          const followupQuestions = await generateFollowupQuestions(
            session.userId,
            message,
            assistantText
              .replace(/\[\[LIVE_AGENT(?:_OFFER)?\]\]/gi, "")
              .replaceAll(CONVERSATION_RESOLVED_MARKER, "")
              .replace(meetingBookingMarkerRe(), "")
              .trim(),
          );
          if (followupQuestions.length > 0) {
            yield { type: "followup_questions", followupQuestions };
          }
          continue;
        }

        yield {
          type: "done",
          influence: event.influence,
          ...(event.liveAgentOffer
            ? { liveAgentOffer: event.liveAgentOffer }
            : {}),
          ...(event.meetingBooking
            ? { meetingBooking: event.meetingBooking }
            : {}),
          ...(event.requestFeedback ? { requestFeedback: true } : {}),
        };
        continue;
      }

      yield event;
    }

    await widgetService.extendPublicChatSessionAfterActivity(
      trimmedKey,
      sessionId,
    );

    if (persistedUserMessageId) {
      void chatAnalyticsService
        .enqueueAnalyzeCompletedTurn({
          executionMode: "real",
          userId: session.userId,
          apiKeyId: session.apiKeyId,
          chatSessionId: session._id,
          userMessageId: new Types.ObjectId(persistedUserMessageId),
          ...(persistedAssistantMessageId
            ? {
                assistantMessageId: new Types.ObjectId(
                  persistedAssistantMessageId,
                ),
              }
            : {}),
          ...(turnTools.length > 0 ? { tools: turnTools } : {}),
        })
        .catch((err) =>
          logger.error(
            err instanceof Error
              ? err.message
              : "Failed to enqueue chat analytics",
            "modules/agent/agent.service.ts",
            "widgetAgentChat",
          ),
        );
    }
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    const sessions = await ChatSessionModel.find({ apiKeyId })
      .select("_id")
      .lean<Array<{ _id: Types.ObjectId }>>();
    const sessionIds = sessions.map((s) => s._id);
    if (sessionIds.length > 0) {
      await ChatMessageModel.deleteMany({ sessionId: { $in: sessionIds } });
    }
    await AgentMemoryModel.deleteMany({ apiKeyId });
    await ChatSessionModel.deleteMany({ apiKeyId });
  }
}

export const agentService = new AgentService();

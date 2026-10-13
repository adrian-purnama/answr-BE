import { Types } from "mongoose";
import { TopicModel } from "../../models/topic/topic.model";
import { mcpService } from "../mcp/mcp.service";
import {
  listToolDeclarations,
  listToolVariables,
  type ToolDeclaration,
} from "../../utils/contentReferences";
import type { LlmToolDefinition } from "../../llm/types";
import type { EnabledMeetingTopicForAgent } from "../../dto/meetingTool.dto";
import { normalizeAgentToolNameKey } from "../../models/meetingTool/meetingTool.interface";
import {
  CALL_LIVE_AGENT_TOOL_NAME,
  BOOK_MEETING_TOOL_PREFIX,
  RECORD_LEAD_FIELDS_TOOL_NAME,
  SUBMIT_LEAD_TOOL_NAME,
} from "./agent.prompts";
import type { LiveAgentResilience } from "../../dto/liveAgent.dto";
import { CALL_LIVE_AGENT_INPUT_SCHEMA } from "./liveAgentHandoff";

export type DeclaredAgentTool = {
  name: string;
  as: string;
  description: string;
  title: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  source: "guidance" | "topic";
  /** Set for built-in meeting topic tools */
  meetingTopicId?: string;
  /** Real topic slug (may contain hyphens) for markers */
  meetingTopicSlug?: string;
};

export {
  CALL_LIVE_AGENT_TOOL_NAME,
  BOOK_MEETING_TOOL_PREFIX,
  RECORD_LEAD_FIELDS_TOOL_NAME,
  SUBMIT_LEAD_TOOL_NAME,
};

export function isCallLiveAgentTool(name: string): boolean {
  return name.toLowerCase() === CALL_LIVE_AGENT_TOOL_NAME.toLowerCase();
}

export function isRecordLeadFieldsTool(name: string): boolean {
  return name.toLowerCase() === RECORD_LEAD_FIELDS_TOOL_NAME.toLowerCase();
}

export function isSubmitLeadTool(name: string): boolean {
  return name.toLowerCase() === SUBMIT_LEAD_TOOL_NAME.toLowerCase();
}

export function isBookMeetingToolName(name: string): boolean {
  return name.toLowerCase().startsWith(BOOK_MEETING_TOOL_PREFIX);
}

const CALL_LIVE_AGENT_DESCRIPTION =
  "Hand the visitor off to a live human agent. Only call this when the live agent instructions in your system prompt say handoff is justified. The call may be declined (offered: false); if so, keep helping the visitor.";

const CALL_LIVE_AGENT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    offered: { type: "boolean" },
    instruction: { type: "string" },
  },
};

function bookMeetingDescription(topicName: string): string {
  return `Present a deterministic meeting-booking interface for "${topicName}". Call this when the visitor wants to schedule this type of meeting or when guidance instructs you to offer it. Do not invent availability, conflict decisions, meeting IDs, or booking status   the product UI and backend handle those.`;
}

function mergeDeclarations(
  existing: Map<string, ToolDeclaration & { source: "guidance" | "topic" }>,
  content: string,
  source: "guidance" | "topic",
): void {
  for (const decl of listToolDeclarations(content)) {
    const key = decl.as.toLowerCase();
    if (existing.has(key)) continue;
    existing.set(key, { ...decl, source });
  }
}

/**
 * Always-on tools for a turn: guidance `{{tool}}` tokens, live agent, lead
 * capture, and enabled meeting topics. MCP tools declared inside articles are
 * added later from retrieved topics only (`appendDeclaredToolsFromTopics`).
 */
export async function collectDeclaredTools(input: {
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
  guidanceContents: string[];
  liveAgentEnabled?: boolean;
  /** When "never", call_live_agent is not registered. */
  liveAgentResilience?: LiveAgentResilience;
  enabledMeetingTopics?: EnabledMeetingTopicForAgent[];
  leadCaptureEnabled?: boolean;
}): Promise<DeclaredAgentTool[]> {
  const liveAgentHandoffAllowed = input.liveAgentResilience !== "never";
  const declMap = new Map<
    string,
    ToolDeclaration & { source: "guidance" | "topic" }
  >();

  for (const content of input.guidanceContents) {
    mergeDeclarations(declMap, content, "guidance");
  }

  const meetingTopics = input.enabledMeetingTopics ?? [];

  const enabled =
    declMap.size > 0
      ? await mcpService.listEnabledTools(input.userId, input.apiKeyId)
      : [];
  const byName = new Map(
    enabled.map((tool) => [tool.name.toLowerCase(), tool]),
  );
  const meetingByToolName = new Map<string, EnabledMeetingTopicForAgent>();
  for (const topic of meetingTopics) {
    meetingByToolName.set(normalizeAgentToolNameKey(topic.toolName), topic);
    meetingByToolName.set(
      normalizeAgentToolNameKey(`book_meeting_${topic.slug}`),
      topic,
    );
  }

  const out: DeclaredAgentTool[] = [];
  for (const decl of declMap.values()) {
    if (isCallLiveAgentTool(decl.name)) {
      if (!liveAgentHandoffAllowed || !input.liveAgentEnabled) continue;
      out.push({
        name: CALL_LIVE_AGENT_TOOL_NAME,
        as: decl.as,
        description: CALL_LIVE_AGENT_DESCRIPTION,
        title: "Call live agent",
        inputSchema: { ...CALL_LIVE_AGENT_INPUT_SCHEMA },
        outputSchema: CALL_LIVE_AGENT_OUTPUT_SCHEMA,
        source: decl.source,
      });
      continue;
    }

    const meetingTopic = meetingByToolName.get(
      normalizeAgentToolNameKey(decl.name),
    );
    if (meetingTopic) {
      out.push({
        name: meetingTopic.toolName,
        as: decl.as,
        description: bookMeetingDescription(meetingTopic.name),
        title: meetingTopic.name,
        inputSchema: { type: "object", properties: {} },
        outputSchema: {
          type: "object",
          properties: {
            presented: { type: "boolean" },
          },
        },
        source: decl.source,
        meetingTopicId: meetingTopic.id,
        meetingTopicSlug: meetingTopic.slug,
      });
      continue;
    }

    const tool = byName.get(decl.name.toLowerCase());
    if (!tool) continue;
    out.push({
      name: tool.name,
      as: decl.as,
      description: tool.description || tool.title || tool.name,
      title: tool.title || tool.name,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema ?? {},
      source: decl.source,
    });
  }

  // Enabled meeting topics are always callable   chips are optional.
  const already = new Set(
    out.map((tool) => normalizeAgentToolNameKey(tool.name)),
  );
  if (
    liveAgentHandoffAllowed &&
    !already.has(normalizeAgentToolNameKey(CALL_LIVE_AGENT_TOOL_NAME))
  ) {
    out.push({
      name: CALL_LIVE_AGENT_TOOL_NAME,
      as: CALL_LIVE_AGENT_TOOL_NAME,
      description: CALL_LIVE_AGENT_DESCRIPTION,
      title: "Call live agent",
      inputSchema: { ...CALL_LIVE_AGENT_INPUT_SCHEMA },
      outputSchema: CALL_LIVE_AGENT_OUTPUT_SCHEMA,
      source: "guidance",
    });
    already.add(normalizeAgentToolNameKey(CALL_LIVE_AGENT_TOOL_NAME));
  }

  if (
    input.leadCaptureEnabled &&
    !already.has(normalizeAgentToolNameKey(RECORD_LEAD_FIELDS_TOOL_NAME)) &&
    !already.has(normalizeAgentToolNameKey(SUBMIT_LEAD_TOOL_NAME))
  ) {
    out.push(
      {
        name: RECORD_LEAD_FIELDS_TOOL_NAME,
        as: RECORD_LEAD_FIELDS_TOOL_NAME,
        description:
          "Store customer fields the visitor already stated in this conversation. Pass only configured Lead Capture keys. Do not submit the lead.",
        title: "Record lead fields",
        inputSchema: {
          type: "object",
          properties: {
            fields: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["fields"],
        },
        outputSchema: {
          type: "object",
          properties: {
            submitted: { type: "boolean" },
            missingRequired: { type: "array" },
            gathered: { type: "object" },
            instruction: { type: "string" },
          },
        },
        source: "guidance",
      },
      {
        name: SUBMIT_LEAD_TOOL_NAME,
        as: SUBMIT_LEAD_TOOL_NAME,
        description:
          "Submit or update the lead for this conversation when it is a lead, qualified lead, or hot lead. The server checks required fields and writes the database.",
        title: "Submit lead",
        inputSchema: {
          type: "object",
          properties: {
            qualification: {
              type: "string",
              enum: ["lead", "qualified", "hot"],
            },
            fields: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            summary: { type: "string" },
          },
          required: ["qualification"],
        },
        outputSchema: {
          type: "object",
          properties: {
            submitted: { type: "boolean" },
            status: { type: "string" },
            missingRequired: { type: "array" },
            ask: { type: "string" },
            instruction: { type: "string" },
          },
        },
        source: "guidance",
      },
    );
  }

  for (const meetingTopic of meetingTopics) {
    if (already.has(normalizeAgentToolNameKey(meetingTopic.toolName))) continue;
    out.push({
      name: meetingTopic.toolName,
      as: normalizeAgentToolNameKey(meetingTopic.toolName),
      description: bookMeetingDescription(meetingTopic.name),
      title: meetingTopic.name,
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: {
          presented: { type: "boolean" },
        },
      },
      source: "guidance",
      meetingTopicId: meetingTopic.id,
      meetingTopicSlug: meetingTopic.slug,
    });
  }

  return out;
}

/**
 * MCP tools whose `{{tool}}` chip is in a retrieved topic. Any chunk from that
 * topic includes every declaration in its full content. Guidance aliases and
 * built-in tools already in `declared` win.
 */
export async function appendDeclaredToolsFromTopics(input: {
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
  topicIds: string[];
  declared: DeclaredAgentTool[];
}): Promise<DeclaredAgentTool[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const topicId of input.topicIds) {
    if (!Types.ObjectId.isValid(topicId) || seen.has(topicId)) continue;
    seen.add(topicId);
    ids.push(topicId);
  }
  if (ids.length === 0) return input.declared;

  const topics = await TopicModel.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    apiKeyId: input.apiKeyId,
    enabled: true,
  })
    .select("topicContent")
    .lean<Array<{ _id: Types.ObjectId; topicContent?: string }>>();

  const byId = new Map(topics.map((topic) => [topic._id.toString(), topic]));
  const taken = new Set(input.declared.map((tool) => tool.as.toLowerCase()));
  const declMap = new Map<string, ToolDeclaration>();

  for (const id of ids) {
    const topic = byId.get(id);
    if (!topic) continue;
    const content =
      typeof topic.topicContent === "string" ? topic.topicContent : "";
    for (const decl of listToolDeclarations(content)) {
      const key = decl.as.toLowerCase();
      if (taken.has(key) || declMap.has(key)) continue;
      declMap.set(key, decl);
    }
  }

  if (declMap.size === 0) return input.declared;

  const enabled = await mcpService.listEnabledTools(input.userId, input.apiKeyId);
  const byName = new Map(
    enabled.map((tool) => [tool.name.toLowerCase(), tool]),
  );
  const extra: DeclaredAgentTool[] = [];
  for (const decl of declMap.values()) {
    if (
      isCallLiveAgentTool(decl.name) ||
      isBookMeetingToolName(decl.name) ||
      isRecordLeadFieldsTool(decl.name) ||
      isSubmitLeadTool(decl.name)
    ) {
      continue;
    }
    const tool = byName.get(decl.name.toLowerCase());
    if (!tool) continue;
    extra.push({
      name: tool.name,
      as: decl.as,
      description: tool.description || tool.title || tool.name,
      title: tool.title || tool.name,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema ?? {},
      source: "topic",
    });
  }

  return extra.length > 0 ? [...input.declared, ...extra] : input.declared;
}

/** Resolve a model tool call against declared tools (name, alias, hyphen/underscore). */
export function resolveDeclaredToolCall(
  declared: DeclaredAgentTool[],
  callName: string,
): DeclaredAgentTool | undefined {
  const key = callName.trim().toLowerCase();
  if (!key) return undefined;
  const normalized = normalizeAgentToolNameKey(key);

  for (const tool of declared) {
    if (tool.name.toLowerCase() === key) return tool;
    if (tool.as.toLowerCase() === key) return tool;
  }
  for (const tool of declared) {
    if (normalizeAgentToolNameKey(tool.name) === normalized) return tool;
    if (normalizeAgentToolNameKey(tool.as) === normalized) return tool;
  }
  return undefined;
}

export function toLlmToolDefinitions(
  tools: DeclaredAgentTool[],
): LlmToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: `${tool.description} (output alias: ${tool.as})`,
    parameters:
      tool.inputSchema && Object.keys(tool.inputSchema).length > 0
        ? tool.inputSchema
        : { type: "object", properties: {} },
  }));
}

/** Lowercased aliases referenced by `{{tool_variable ref="…"}}` in content. */
export function aliasesNeededForVariables(contents: string[]): Set<string> {
  const needed = new Set<string>();
  for (const content of contents) {
    for (const variable of listToolVariables(content)) {
      needed.add(variable.ref.toLowerCase());
    }
  }
  return needed;
}

/** Shallow dotted paths from a JSON-schema-ish object (max depth 2). */
export function schemaOutputFieldNames(
  schema: Record<string, unknown>,
  prefix = "",
  depth = 0,
): string[] {
  if (depth > 2) return [];
  const paths: string[] = [];
  const props = schema.properties;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(
      props as Record<string, unknown>,
    )) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      if (
        depth < 2 &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        paths.push(
          ...schemaOutputFieldNames(
            value as Record<string, unknown>,
            path,
            depth + 1,
          ),
        );
      }
    }
    return paths;
  }
  return paths;
}

export function formatDeclaredToolsPrompt(tools: DeclaredAgentTool[]): string {
  if (tools.length === 0) return "";
  const blocks = tools.map((tool) => {
    const fields = schemaOutputFieldNames(tool.outputSchema);
    const fieldLine =
      fields.length > 0
        ? `Output fields (under alias ${tool.as}):\n${fields.join(", ")}`
        : `Output alias:\n${tool.as}`;
    return [
      `Available tool (call this function by name when the user needs this data):`,
      tool.name,
      ``,
      `Description:`,
      tool.description,
      ``,
      fieldLine,
    ].join("\n");
  });
  return [
    "You have native function tools listed below. Call them when the user asks for data they provide. Do not invent values for their output fields.",
    ...blocks,
  ].join("\n\n");
}

/** Prefer structured object; unwrap common MCP `{ content: [...] }` shapes. */
export function normalizeToolResult(result: unknown): unknown {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    // Prefer direct structured fields when present
    if ("plans" in record || "message" in record || "name" in record) {
      return result;
    }
  }

  if (Array.isArray(result)) {
    const texts: string[] = [];
    for (const item of result) {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        (item as { type?: unknown }).type === "text" &&
        "text" in item &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        texts.push((item as { text: string }).text);
      }
    }
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0]) as unknown;
      } catch {
        return texts[0];
      }
    }
    if (texts.length > 1) return texts.join("\n");
  }

  if (typeof result === "string") {
    try {
      return JSON.parse(result) as unknown;
    } catch {
      return result;
    }
  }

  return result;
}

const TOOL_RESULT_INFLUENCE_MAX_CHARS = 16_384;

/** Cap tool payloads for SSE influence (train/debug UI). */
export function truncateToolResultForInfluence(result: unknown): unknown {
  try {
    const text = JSON.stringify(result);
    if (text == null) return result;
    if (text.length <= TOOL_RESULT_INFLUENCE_MAX_CHARS) {
      return result;
    }
    return {
      _truncated: true,
      preview: `${text.slice(0, TOOL_RESULT_INFLUENCE_MAX_CHARS)}…`,
      originalLength: text.length,
    };
  } catch {
    const fallback = String(result);
    if (fallback.length <= TOOL_RESULT_INFLUENCE_MAX_CHARS) return fallback;
    return `${fallback.slice(0, TOOL_RESULT_INFLUENCE_MAX_CHARS)}…`;
  }
}

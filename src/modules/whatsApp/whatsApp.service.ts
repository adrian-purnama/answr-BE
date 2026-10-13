import { setTimeout as sleep } from "node:timers/promises";
import { convertToString } from "md-to-whatsapp";
import { Types } from "mongoose";
import type {
  UpdateWhatsAppSettingsDto,
  WhatsAppQrOutDto,
  WhatsAppSettingsOutDto,
} from "../../dto/whatsApp.dto";
import { env } from "../../environment/env";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import type { WhatsAppSetting } from "../../models/apiKey/apiKey.interface";
import { UserModel } from "../../models/user/user.model";
import { entitlementService } from "../entitlement/entitlement.service";
import { agentService } from "../agent/agent.service";
import { CHAT_SESSION_TTL_MS } from "../widget/widget.service";
import { logger } from "../../logger/logger";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import type { FlowNode } from "../../models/whatsAppFlowNode/whatsAppFlowNode.interface";
import { WhatsAppFlowNodeModel } from "../../models/whatsAppFlowNode/whatsAppFlowNode.model";
import { chatWithQuota } from "../../llm/chatWithQuota";
import type { LeadFieldConfig } from "../../models/leadCapture/leadCapture.interface";
import { leadCaptureService } from "../leadCapture/leadCapture.service";
import { mcpService } from "../mcp/mcp.service";
import { wahaClient, type WahaSession } from "./wahaClient";

/** Defaults: 1s between GETs, give up after 20s and keep STARTING. */
export const startingPoll = {
  intervalMs: 1000,
  maxMs: 20_000,
};

export type WahaWebhookBody = {
  event?: unknown;
  session?: unknown;
  timestamp?: unknown;
  me?: { id?: unknown; pushName?: unknown } | null;
  payload?: {
    status?: unknown;
    id?: unknown;
    from?: unknown;
    fromMe?: unknown;
    body?: unknown;
    vote?: {
      id?: unknown;
      from?: unknown;
      selectedOptions?: unknown;
    } | null;
    poll?: { id?: unknown } | null;
  } | null;
};

/**
 * WAHA timestamps are milliseconds. Values below 1e12 are treated as seconds.
 * Missing timestamp falls back to now so the first event still applies.
 */
export function webhookEventTime(timestamp: unknown): Date {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return new Date(ms);
  }
  return new Date();
}

function toSettingsOut(
  apiKeyId: Types.ObjectId,
  settings: Partial<WhatsAppSetting> | null | undefined,
): WhatsAppSettingsOutDto {
  const synced = settings?.lastSyncedAt;
  return {
    apiKeyId: apiKeyId.toString(),
    enabled: settings?.enabled === true,
    defaultFlow: settings?.defaultFlow === true,
    sessionName: settings?.sessionName ?? null,
    status: settings?.status ?? null,
    meId: settings?.meId ?? null,
    mePushName: settings?.mePushName ?? null,
    lastSyncedAt:
      synced instanceof Date && !Number.isNaN(synced.getTime())
        ? synced.toISOString()
        : null,
  };
}

/** GET while STARTING. Anything else, or STARTING past the cap, is returned as-is. */
async function waitPastStarting(
  name: string,
  session: WahaSession,
): Promise<WahaSession> {
  const started = Date.now();
  let current = session;
  while (current.status === "STARTING" && Date.now() - started < startingPoll.maxMs) {
    const elapsed = Date.now() - started;
    await sleep(Math.min(startingPoll.intervalMs, startingPoll.maxMs - elapsed));
    const next = await wahaClient.getSession(name);
    if (!next) throw new Error("WAHA session not found");
    current = next;
  }
  return current;
}

function sessionNameFor(userId: Types.ObjectId, apiKeyId: Types.ObjectId): string {
  return `${userId.toString()}-${apiKeyId.toString()}`;
}

function webhookUrlFor(userId: Types.ObjectId, apiKeyId: Types.ObjectId): string {
  return `${env.wahaWebhookBaseUrl}/whatsapp/webhook/${userId.toString()}/${apiKeyId.toString()}`;
}

/** ponytail: in-process queue, a restart drops it. */
const chatTails = new Map<string, Promise<void>>();

function enqueueChat(key: string, job: () => Promise<void>): Promise<void> {
  const prev = chatTails.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  chatTails.set(key, next);
  void next
    .finally(() => {
      if (chatTails.get(key) === next) chatTails.delete(key);
    })
    .catch(() => undefined);
  return next;
}

function replyText(raw: string): string {
  const stripped = raw
    .replace(/\[\[LIVE_AGENT(?:_OFFER)?\]\]/gi, "")
    .replaceAll("[[CONVERSATION_RESOLVED]]", "")
    .trim();
  if (!stripped) return "";
  return convertToString(stripped, { unsupportedMode: "strip" }).trim();
}

async function showPresence(
  session: string,
  chatId: string,
  presence: "typing" | "paused",
): Promise<void> {
  try {
    await wahaClient.setPresence(session, chatId, presence);
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : "WhatsApp presence failed",
      "modules/whatsApp/whatsApp.service.ts",
      "reply",
    );
  }
}

function directChat(from: string): boolean {
  return from.endsWith("@c.us") || from.endsWith("@lid");
}

function toolArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

const BACK_LABEL = "Back";
const BACK_ROW = { title: BACK_LABEL, rowId: "back", description: null };

function toolBrief(
  label: string,
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
): string {
  return `${label}\n${tool.name}\n${tool.description}\n${JSON.stringify(tool.inputSchema)}`;
}

function formPrompt(fields: Array<Pick<LeadFieldConfig, "label">>): string {
  const lines = fields.map((field) => `${field.label}:`);
  return `Please reply with:\n${lines.join("\n")}`;
}

export const flowLlm = {
  summarize(userId: Types.ObjectId, toolName: string, result: unknown): Promise<string> {
    return chatWithQuota({
      userId,
      logSource: "modules/whatsApp/whatsApp.service.ts",
      messages: [
        {
          role: "system",
          content: "Summarize this tool result in one short WhatsApp message. No markdown.",
        },
        {
          role: "user",
          content: `${toolName}\n${JSON.stringify(result).slice(0, 4000)}`,
        },
      ],
    });
  },
  ask(userId: Types.ObjectId, prompt: string): Promise<string> {
    return chatWithQuota({
      userId,
      logSource: "modules/whatsApp/whatsApp.service.ts",
      messages: [
        {
          role: "system",
          content: "Ask for the missing tool arguments in one short WhatsApp message. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    });
  },
  arguments(userId: Types.ObjectId, prompt: string): Promise<string> {
    return chatWithQuota({
      userId,
      logSource: "modules/whatsApp/whatsApp.service.ts",
      messages: [
        {
          role: "system",
          content: "Return only a JSON object of tool arguments. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    });
  },
};

function parseFormReply(
  text: string,
  fields: LeadFieldConfig[],
  missing: string[],
): Record<string, string> {
  const wanted = fields.filter((field) => missing.includes(field.key));
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out: Record<string, string> = {};
  if (lines.length > 0 && lines.every((line) => line.includes(":"))) {
    for (const line of lines) {
      const splitAt = line.indexOf(":");
      const name = line.slice(0, splitAt).trim().toLowerCase();
      const value = line.slice(splitAt + 1).trim();
      const field = wanted.find(
        (item) => item.key.toLowerCase() === name || item.label.toLowerCase() === name,
      );
      if (field && value) out[field.key] = value;
    }
    return out;
  }
  if (wanted.length === 1 && text.trim()) {
    out[wanted[0]!.key] = text.trim();
    return out;
  }
  if (lines.length === wanted.length) {
    wanted.forEach((field, index) => {
      const value = lines[index];
      if (value) out[field.key] = value;
    });
  }
  return out;
}

function logBranch(message: string): void {
  logger.info(message, "modules/whatsApp/whatsApp.service.ts", "handleIncomingMessage");
}

type StoredFlowNode = {
  id: string;
  type: "menu" | "leaf";
  root: boolean;
  header?: string;
  options?: { label: string; targetNodeId: string }[];
  leafType?: "text" | "function_call" | "agent_support" | "form" | null;
  body?: string;
  functionName?: string;
  label?: string;
  parameters?: string;
  askParameters?: boolean;
  handoffTarget?: string;
  fields?: { name: string; label: string; type: string; required: boolean }[];
};

function toPublicNode(doc: StoredFlowNode): FlowNode {
  if (doc.type === "menu") {
    return {
      id: doc.id,
      type: "menu",
      root: doc.root,
      header: doc.header ?? "",
      options: doc.options ?? [],
    };
  }
  const base = { id: doc.id, type: "leaf" as const, root: doc.root };
  if (doc.leafType === "function_call") {
    return {
      ...base,
      leafType: "function_call",
      label: doc.label ?? "",
      functionName: doc.functionName ?? "",
      parameters: doc.parameters ?? "",
      askParameters: doc.askParameters === true,
    };
  }
  if (doc.leafType === "agent_support") {
    return { ...base, leafType: "agent_support", handoffTarget: doc.handoffTarget ?? "" };
  }
  if (doc.leafType === "form") {
    return { ...base, leafType: "form", fields: [] };
  }
  return { ...base, leafType: "text", body: doc.body ?? "" };
}

function storedNode(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  node: FlowNode,
  position: number,
) {
  const common = {
    userId,
    apiKeyId,
    position,
    id: node.id,
    type: node.type,
    root: node.root,
    header: "",
    options: [] as { label: string; targetNodeId: string }[],
    leafType: null as StoredFlowNode["leafType"],
    body: "",
    functionName: "",
    label: "",
    parameters: "",
    askParameters: false,
    handoffTarget: "",
    fields: [] as { name: string; label: string; type: string; required: boolean }[],
  };
  if (node.type === "menu") {
    return { ...common, header: node.header, options: node.options };
  }
  if (node.leafType === "text") return { ...common, leafType: node.leafType, body: node.body };
  if (node.leafType === "function_call") {
    return {
      ...common,
      leafType: node.leafType,
      label: node.label,
      functionName: node.functionName,
      parameters: node.parameters,
      askParameters: node.askParameters,
    };
  }
  if (node.leafType === "agent_support") {
    return { ...common, leafType: node.leafType, handoffTarget: node.handoffTarget };
  }
  return { ...common, leafType: "form", fields: [] };
}

async function loadFlowNodes(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Promise<FlowNode[]> {
  const docs = await WhatsAppFlowNodeModel.find({ userId, apiKeyId })
    .sort({ position: 1 })
    .lean<StoredFlowNode[]>();
  return docs.map(toPublicNode);
}

async function rememberPoll(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  chatId: string,
  pollId: string,
  nodeId: string,
): Promise<void> {
  await ChatSessionModel.updateOne(
    { userId, apiKeyId, whatsAppChatId: chatId },
    {
      $set: {
        flowActivePollId: pollId,
        flowActiveNodeId: nodeId,
        expiredAt: new Date(Date.now() + CHAT_SESSION_TTL_MS),
      },
      $setOnInsert: {
        publicKey: "whatsapp",
        visitorAuthMode: "anonymous",
        visitor: null,
      },
    },
    { upsert: true },
  );
}

class WhatsAppService {
  async getSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppSettingsOutDto> {
    await entitlementService.assertWhatsAppEntitled(userId, apiKeyId);
    const stored = await this.readSettings(apiKeyId);
    if (!stored.enabled || !stored.sessionName) return stored;
    try {
      const session = await wahaClient.getSession(stored.sessionName);
      if (!session) return stored;
      const meId = session.me?.id ?? null;
      const mePushName = session.me?.pushName ?? null;
      if (
        session.status === stored.status &&
        meId === stored.meId &&
        mePushName === stored.mePushName
      ) {
        return stored;
      }
      await ApiKeyModel.updateOne(
        { _id: apiKeyId },
        {
          $set: {
            "whatsAppSetting.status": session.status,
            "whatsAppSetting.meId": meId,
            "whatsAppSetting.mePushName": mePushName,
            "whatsAppSetting.lastSyncedAt": new Date(),
          },
        },
      );
      return this.readSettings(apiKeyId);
    } catch {
      return stored;
    }
  }

  async updateSettings(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    patch: UpdateWhatsAppSettingsDto,
  ): Promise<WhatsAppSettingsOutDto> {
    await entitlementService.assertWhatsAppEntitled(userId, apiKeyId);
    if (patch.enabled === false) {
      return this.disable(apiKeyId);
    }
    if (patch.enabled === true) {
      return this.enable(userId, apiKeyId);
    }
    if (patch.defaultFlow !== undefined) {
      await ApiKeyModel.updateOne(
        { _id: apiKeyId },
        { $set: { "whatsAppSetting.defaultFlow": patch.defaultFlow } },
      );
      if (patch.defaultFlow === true) {
        const stored = await this.readSettings(apiKeyId);
        if (stored.sessionName) {
          await wahaClient.updateWebhooks(
            stored.sessionName,
            webhookUrlFor(userId, apiKeyId),
          );
        }
      }
    }
    return this.readSettings(apiKeyId);
  }

  async getQr(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppQrOutDto> {
    const settings = await this.requireEnabledSession(userId, apiKeyId);
    if (settings.status !== "SCAN_QR_CODE") {
      throw new Error("WhatsApp is not ready to scan");
    }
    const png = await wahaClient.getQrPng(settings.sessionName as string);
    return { imageBase64: png.toString("base64") };
  }

  logout(userId: Types.ObjectId, apiKeyId: Types.ObjectId) {
    return this.afterSession(userId, apiKeyId, (name) => wahaClient.logoutSession(name));
  }

  restart(userId: Types.ObjectId, apiKeyId: Types.ObjectId) {
    return this.afterSession(userId, apiKeyId, (name) => wahaClient.restartSession(name));
  }

  /**
   * Apply a session.status webhook. Stale events match nothing and are ignored.
   * Does not call WAHA.
   */
  async applySessionStatus(
    apiKeyId: Types.ObjectId,
    body: WahaWebhookBody,
  ): Promise<void> {
    const eventTime = webhookEventTime(body.timestamp);
    const status =
      typeof body.payload?.status === "string" ? body.payload.status : null;
    const $set: Record<string, unknown> = {
      "whatsAppSetting.lastSyncedAt": eventTime,
    };
    if (status) $set["whatsAppSetting.status"] = status;
    const meId = body.me?.id;
    const pushName = body.me?.pushName;
    if (typeof meId === "string" && meId) $set["whatsAppSetting.meId"] = meId;
    if (typeof pushName === "string") {
      $set["whatsAppSetting.mePushName"] = pushName;
    }
    await ApiKeyModel.updateOne(
      {
        _id: apiKeyId,
        $or: [
          { "whatsAppSetting.lastSyncedAt": null },
          { "whatsAppSetting.lastSyncedAt": { $exists: false } },
          { "whatsAppSetting.lastSyncedAt": { $lte: eventTime } },
        ],
      },
      { $set },
    );
  }

  handleIncomingMessage(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    body: WahaWebhookBody,
    defaultFlow = false,
  ): Promise<void> {
    const from = typeof body.payload?.from === "string" ? body.payload.from : "";
    const text = typeof body.payload?.body === "string" ? body.payload.body.trim() : "";
    if (body.payload?.fromMe === true) {
      logBranch(`skipped fromMe ${from}`);
      return Promise.resolve();
    }
    if (!directChat(from)) {
      logBranch(`skipped chat ${from || "(none)"}`);
      return Promise.resolve();
    }
    if (!text) {
      logBranch(`skipped empty body ${from}`);
      return Promise.resolve();
    }
    if (defaultFlow) {
      logBranch(`routing to flow ${from}`);
      const key = `${apiKeyId.toString()}:${from}`;
      const messageId = typeof body.payload?.id === "string" ? body.payload.id : "";
      return enqueueChat(key, () =>
        this.onFlowMessage(userId, apiKeyId, sessionName, from, text, messageId),
      );
    }
    logBranch(`routing to agent ${from}`);
    const key = `${apiKeyId.toString()}:${from}`;
    return enqueueChat(key, () => this.reply(userId, apiKeyId, sessionName, from, text));
  }

  private async reply(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    await showPresence(sessionName, chatId, "typing");
    try {
      let raw = "";
      for await (const event of agentService.whatsAppAgentChat(
        userId,
        apiKeyId,
        chatId,
        text,
      )) {
        if (event.type === "token") raw += event.text;
      }
      const reply = replyText(raw);
      if (!reply) return;
      await wahaClient.sendText(sessionName, chatId, reply);
    } finally {
      await showPresence(sessionName, chatId, "paused");
    }
  }

  async getFlow(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<FlowNode[]> {
    await entitlementService.assertWhatsAppEntitled(userId, apiKeyId);
    return loadFlowNodes(userId, apiKeyId);
  }

  async replaceFlow(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    nodes: FlowNode[],
  ): Promise<FlowNode[]> {
    await entitlementService.assertWhatsAppEntitled(userId, apiKeyId);
    await WhatsAppFlowNodeModel.deleteMany({ userId, apiKeyId });
    if (nodes.length > 0) {
      await WhatsAppFlowNodeModel.insertMany(
        nodes.map((node, position) => storedNode(userId, apiKeyId, node, position)),
      );
    }
    return nodes;
  }

  handlePollVote(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    body: WahaWebhookBody,
  ): Promise<void> {
    const vote = body.payload?.vote;
    const pollId = typeof body.payload?.poll?.id === "string" ? body.payload.poll.id : "";
    const voteId = typeof vote?.id === "string" ? vote.id : "";
    const from = typeof vote?.from === "string" ? vote.from : "";
    const selected = Array.isArray(vote?.selectedOptions) ? vote.selectedOptions : [];
    const choice = typeof selected[0] === "string" ? selected[0] : "";
    if (!selected.length || !choice) return Promise.resolve();
    if (!voteId || !pollId || !directChat(from)) return Promise.resolve();
    const key = `${apiKeyId.toString()}:${from}`;
    return enqueueChat(key, () =>
      this.advanceVote(userId, apiKeyId, sessionName, from, pollId, voteId, choice),
    );
  }

  private async onFlowMessage(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    text: string,
    messageId: string,
  ): Promise<void> {
    if (text === BACK_LABEL) {
      await this.goBack(userId, apiKeyId, sessionName, chatId, messageId || text);
      return;
    }
    const open = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (open?.flowActivePollId === "form" && open.flowActiveNodeId) {
      await this.fillForm(userId, apiKeyId, sessionName, chatId, text);
      return;
    }
    if (open?.flowActivePollId === "ask" && open.flowActiveNodeId) {
      await this.answerFunction(userId, apiKeyId, sessionName, chatId, text);
      return;
    }
    if (open?.flowActivePollId === "list" && open.flowActiveNodeId) {
      const nodes = await loadFlowNodes(userId, apiKeyId);
      const menu = nodes.find(
        (node) => node.id === open.flowActiveNodeId && node.type === "menu",
      );
      const matched =
        menu?.type === "menu" && menu.options.some((option) => option.label === text);
      if (matched) {
        await this.advanceVote(
          userId,
          apiKeyId,
          sessionName,
          chatId,
          "list",
          messageId || text,
          text,
        );
      }
      return;
    }
    await this.presentRoot(userId, apiKeyId, sessionName, chatId);
  }

  private async presentRoot(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
  ): Promise<void> {
    const open = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (open?.flowActivePollId) return;
    const nodes = await loadFlowNodes(userId, apiKeyId);
    const root = nodes.find((node) => node.root);
    if (!root) return;
    await ChatSessionModel.updateOne(
      { userId, apiKeyId, whatsAppChatId: chatId },
      { $set: { flowBackStack: [] } },
    );
    await this.deliverNode(userId, apiKeyId, sessionName, chatId, root);
  }

  private async advanceVote(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    pollId: string,
    voteId: string,
    choice: string,
  ): Promise<void> {
    const session = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (!session) return;
    if (session.flowSeenVoteIds?.includes(voteId)) return;
    if (session.flowActivePollId !== pollId || !session.flowActiveNodeId) return;
    const nodeId = session.flowActiveNodeId;
    const cleared = await ChatSessionModel.updateOne(
      { userId, apiKeyId, whatsAppChatId: chatId, flowActivePollId: pollId },
      {
        $set: { flowActivePollId: null, flowActiveNodeId: null },
        $push: { flowSeenVoteIds: { $each: [voteId], $slice: -50 } },
      },
    );
    if (cleared.matchedCount !== 1) return;
    if (choice === BACK_LABEL) {
      await this.goBack(userId, apiKeyId, sessionName, chatId, "");
      return;
    }
    const nodes = await loadFlowNodes(userId, apiKeyId);
    const menu = nodes.find((node) => node.id === nodeId && node.type === "menu");
    if (!menu || menu.type !== "menu") return;
    const option = menu.options.find((item) => item.label === choice);
    if (!option) return;
    const target = nodes.find((node) => node.id === option.targetNodeId);
    if (!target) return;
    await ChatSessionModel.updateOne(
      { userId, apiKeyId, whatsAppChatId: chatId },
      { $push: { flowBackStack: nodeId } },
    );
    await this.deliverNode(userId, apiKeyId, sessionName, chatId, target);
  }

  private async goBack(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    seenId: string,
  ): Promise<void> {
    const session = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (!session) {
      await this.presentRoot(userId, apiKeyId, sessionName, chatId);
      return;
    }
    if (seenId && session.flowSeenVoteIds?.includes(seenId)) return;
    const stack = [...(session.flowBackStack ?? [])];
    const previousId = stack.pop();
    const update: {
      $set: Record<string, unknown>;
      $push?: { flowSeenVoteIds: { $each: string[]; $slice: number } };
    } = {
      $set: {
        flowBackStack: stack,
        ...(previousId
          ? { flowActivePollId: null, flowActiveNodeId: null }
          : {}),
      },
    };
    if (seenId) {
      update.$push = { flowSeenVoteIds: { $each: [seenId], $slice: -50 } };
    }
    await ChatSessionModel.updateOne({ _id: session._id }, update);
    if (!previousId) {
      if (session.flowActivePollId) return;
      await this.presentRoot(userId, apiKeyId, sessionName, chatId);
      return;
    }
    const nodes = await loadFlowNodes(userId, apiKeyId);
    const previous = nodes.find((node) => node.id === previousId);
    if (!previous) {
      await this.presentRoot(userId, apiKeyId, sessionName, chatId);
      return;
    }
    await this.deliverNode(userId, apiKeyId, sessionName, chatId, previous);
  }

  private async deliverNode(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    node: FlowNode,
  ): Promise<void> {
    if (node.type === "menu") {
      if (!node.options.length) return;
      const heading = node.header.trim() || "Menu";
      const rows = node.options.map((option) => ({
        title: option.label,
        rowId: option.label,
        description: null,
      }));
      if (!node.root) rows.push(BACK_ROW);
      await wahaClient.sendList(sessionName, chatId, {
        title: heading,
        description: heading,
        button: "Choose",
        sections: [{ title: "Main", rows }],
      });
      await rememberPoll(userId, apiKeyId, chatId, "list", node.id);
      return;
    }
    if (node.leafType === "text") {
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, node.body, "list");
      return;
    }
    if (node.leafType === "function_call") {
      await this.deliverFunction(userId, apiKeyId, sessionName, chatId, node);
      return;
    }
    if (node.leafType === "form") {
      await this.deliverForm(userId, apiKeyId, sessionName, chatId, node);
      return;
    }
    await this.sendLeaf(
      userId,
      apiKeyId,
      sessionName,
      chatId,
      node,
      node.handoffTarget.trim() || "Agent",
      "list",
    );
  }

  private async sendLeaf(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    node: Extract<FlowNode, { type: "leaf" }>,
    text: string,
    poll: "list" | "form" | "ask",
  ): Promise<void> {
    if (node.root) {
      await wahaClient.sendText(sessionName, chatId, text);
      if (poll === "form" || poll === "ask") {
        await rememberPoll(userId, apiKeyId, chatId, poll, node.id);
      } else {
        await this.clearFlow(userId, apiKeyId, chatId);
      }
      return;
    }
    const title =
      node.leafType === "function_call"
        ? node.label.trim() || "Function"
        : node.leafType === "form"
          ? "Form"
          : node.leafType === "agent_support"
            ? "Agent"
            : "Message";
    await wahaClient.sendList(sessionName, chatId, {
      title,
      description: text,
      button: "Choose",
      sections: [{ title: "Main", rows: [BACK_ROW] }],
    });
    await rememberPoll(userId, apiKeyId, chatId, poll, node.id);
  }

  private async deliverFunction(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    node: Extract<FlowNode, { leafType: "function_call" }>,
  ): Promise<void> {
    try {
      if (node.askParameters) {
        const tool = await this.enabledTool(userId, apiKeyId, node.functionName);
        if (!tool) throw new Error("MCP tool not found");
        const question = await flowLlm.ask(userId, toolBrief(node.label, tool));
        await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, question.trim(), "ask");
        return;
      }
      const called = await mcpService.callEnabledTool(
        userId,
        apiKeyId,
        node.functionName,
        toolArgs(node.parameters),
      );
      const summary = await flowLlm.summarize(userId, called.name, called.result);
      await this.sendLeaf(
        userId,
        apiKeyId,
        sessionName,
        chatId,
        node,
        summary.trim() || "Done.",
        "list",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, message, "list");
    }
  }

  private async answerFunction(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    const session = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    const nodeId = session?.flowActiveNodeId;
    if (!nodeId) return;
    const nodes = await loadFlowNodes(userId, apiKeyId);
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.type !== "leaf" || node.leafType !== "function_call") return;
    const tool = await this.enabledTool(userId, apiKeyId, node.functionName);
    if (!tool) {
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, "MCP tool not found", "list");
      return;
    }
    const raw = await flowLlm.arguments(userId, `${toolBrief(node.label, tool)}\n${text}`);
    const args = parseJsonObject(raw);
    if (!args) {
      const question = await flowLlm.ask(userId, toolBrief(node.label, tool));
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, question.trim(), "ask");
      return;
    }
    try {
      const called = await mcpService.callEnabledTool(userId, apiKeyId, node.functionName, args);
      const summary = await flowLlm.summarize(userId, called.name, called.result);
      await this.sendLeaf(
        userId,
        apiKeyId,
        sessionName,
        chatId,
        node,
        summary.trim() || "Done.",
        "list",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, message, "list");
    }
  }

  private async enabledTool(userId: Types.ObjectId, apiKeyId: Types.ObjectId, name: string) {
    const tools = await mcpService.listEnabledTools(userId, apiKeyId);
    const wanted = name.trim().toLowerCase();
    return tools.find((tool) => tool.name.toLowerCase() === wanted) ?? null;
  }

  private async deliverForm(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    node: Extract<FlowNode, { leafType: "form" }>,
  ): Promise<void> {
    await rememberPoll(userId, apiKeyId, chatId, "form", node.id);
    const session = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (!session) return;
    const ctx = await leadCaptureService.agentContext(
      userId,
      apiKeyId,
      session._id.toString(),
    );
    if (!ctx) {
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, "Lead capture is off.", "list");
      return;
    }
    const required = ctx.fields.filter((field) => field.required);
    const missing = required.filter((field) => ctx.missingRequired.includes(field.key));
    if (missing.length === 0) {
      await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, "Already saved.", "list");
      return;
    }
    await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, formPrompt(missing), "form");
  }

  private async fillForm(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionName: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    const session = await ChatSessionModel.findOne({
      userId,
      apiKeyId,
      whatsAppChatId: chatId,
    });
    if (!session) return;
    const nodes = await loadFlowNodes(userId, apiKeyId);
    const current = nodes.find((item) => item.id === session.flowActiveNodeId);
    const node = current?.type === "leaf" && current.leafType === "form" ? current : null;
    const say = async (message: string, poll: "list" | "form") => {
      if (node) {
        await this.sendLeaf(userId, apiKeyId, sessionName, chatId, node, message, poll);
        return;
      }
      await wahaClient.sendText(sessionName, chatId, message);
      if (poll === "list") await this.clearFlow(userId, apiKeyId, chatId);
    };
    const ctx = await leadCaptureService.agentContext(
      userId,
      apiKeyId,
      session._id.toString(),
    );
    if (!ctx) {
      await say("Lead capture is off.", "list");
      return;
    }
    const required = ctx.fields.filter((field) => field.required);
    const incoming = parseFormReply(text, required, ctx.missingRequired);
    if (Object.keys(incoming).length === 0) {
      const missing = required.filter((field) => ctx.missingRequired.includes(field.key));
      await say(formPrompt(missing), "form");
      return;
    }
    const sessionId = session._id.toString();
    try {
      const recorded = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId,
        action: "record",
        fields: incoming,
      });
      if (recorded.alreadyCaptured) {
        await say("Already saved.", "list");
        return;
      }
      if (recorded.missingRequired.length > 0) {
        const missing = required.filter((field) =>
          recorded.missingRequired.includes(field.key),
        );
        await say(formPrompt(missing), "form");
        return;
      }
      await leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId,
        action: "submit",
        fields: {},
        qualification: "lead",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save";
      await say(message, "list");
      return;
    }
    await say("Saved.", "list");
  }

  private async clearFlow(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    chatId: string,
  ): Promise<void> {
    await ChatSessionModel.updateOne(
      { userId, apiKeyId, whatsAppChatId: chatId },
      { $set: { flowActivePollId: null, flowActiveNodeId: null } },
    );
  }

  private async enable(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppSettingsOutDto> {
    const name = sessionNameFor(userId, apiKeyId);
    const user = await UserModel.findById(userId)
      .select("email")
      .lean<{ email?: string } | null>();

    await ApiKeyModel.updateOne(
      { _id: apiKeyId },
      {
        $set: {
          "whatsAppSetting.enabled": true,
          "whatsAppSetting.sessionName": name,
        },
      },
    );

    try {
      const session = await waitPastStarting(
        name,
        await this.resolveSession(userId, apiKeyId, name, {
          "user.id": userId.toString(),
          "user.email": user?.email ?? "",
          "apiKey.id": apiKeyId.toString(),
        }),
      );
      const $set: Record<string, unknown> = {
        "whatsAppSetting.status": session.status,
      };
      if (session.me?.id) $set["whatsAppSetting.meId"] = session.me.id;
      if (session.me?.pushName) {
        $set["whatsAppSetting.mePushName"] = session.me.pushName;
      }
      await ApiKeyModel.updateOne({ _id: apiKeyId }, { $set });
    } catch (error) {
      await ApiKeyModel.updateOne(
        { _id: apiKeyId },
        { $set: { "whatsAppSetting.enabled": false } },
      );
      throw error;
    }

    return this.readSettings(apiKeyId);
  }

  private async resolveSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    name: string,
    metadata: Record<string, string>,
  ): Promise<WahaSession> {
    const session = await wahaClient.getSession(name);
    if (!session) {
      return wahaClient.createSession({
        name,
        metadata,
        webhookUrl: webhookUrlFor(userId, apiKeyId),
      });
    }
    await wahaClient.startSession(name);
    const started = await wahaClient.getSession(name);
    if (!started) throw new Error("WAHA session not found");
    return started;
  }

  private async disable(
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppSettingsOutDto> {
    const current = await this.readSettings(apiKeyId);
    if (!current.sessionName) {
      await ApiKeyModel.updateOne(
        { _id: apiKeyId },
        { $set: { "whatsAppSetting.enabled": false } },
      );
      return this.readSettings(apiKeyId);
    }

    const stopped = await wahaClient.stopSession(current.sessionName);
    let status = "STOPPED";
    if (stopped === "stopped") {
      const session = await wahaClient.getSession(current.sessionName);
      if (session?.status) status = session.status;
    }
    await ApiKeyModel.updateOne(
      { _id: apiKeyId },
      {
        $set: {
          "whatsAppSetting.enabled": false,
          "whatsAppSetting.status": status,
        },
      },
    );
    return this.readSettings(apiKeyId);
  }

  private async afterSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    action: (name: string) => Promise<void>,
  ): Promise<WhatsAppSettingsOutDto> {
    const settings = await this.requireEnabledSession(userId, apiKeyId);
    const name = settings.sessionName as string;
    await action(name);
    return this.saveFollowUpStatus(apiKeyId, name);
  }

  private async requireEnabledSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppSettingsOutDto> {
    await entitlementService.assertWhatsAppEntitled(userId, apiKeyId);
    const settings = await this.readSettings(apiKeyId);
    if (!settings.enabled || !settings.sessionName) {
      throw new Error("WhatsApp is not enabled");
    }
    return settings;
  }

  private async saveFollowUpStatus(
    apiKeyId: Types.ObjectId,
    name: string,
  ): Promise<WhatsAppSettingsOutDto> {
    const current = await wahaClient.getSession(name);
    if (!current) throw new Error("WAHA session not found");
    const session = await waitPastStarting(name, current);
    await ApiKeyModel.updateOne(
      { _id: apiKeyId },
      {
        $set: {
          "whatsAppSetting.status": session.status,
          "whatsAppSetting.meId": session.me?.id ?? null,
          "whatsAppSetting.mePushName": session.me?.pushName ?? null,
        },
      },
    );
    return this.readSettings(apiKeyId);
  }

  private async readSettings(
    apiKeyId: Types.ObjectId,
  ): Promise<WhatsAppSettingsOutDto> {
    const doc = await ApiKeyModel.findById(apiKeyId).lean<{
      whatsAppSetting?: WhatsAppSetting;
    } | null>();
    if (!doc) throw new Error("API key not found");
    return toSettingsOut(apiKeyId, doc.whatsAppSetting);
  }
}

export const whatsAppService = new WhatsAppService();

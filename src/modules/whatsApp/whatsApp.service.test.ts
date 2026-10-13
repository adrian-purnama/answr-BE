import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import { WhatsAppFlowNodeModel } from "../../models/whatsAppFlowNode/whatsAppFlowNode.model";
import { UserModel } from "../../models/user/user.model";
import { agentService } from "../agent/agent.service";
import { leadCaptureService } from "../leadCapture/leadCapture.service";
import { mcpService } from "../mcp/mcp.service";
import { entitlementService } from "../entitlement/entitlement.service";
import { whatsAppController } from "./whatsApp.controller";
import {
  startingPoll,
  webhookEventTime,
  whatsAppService,
  flowLlm,
} from "./whatsApp.service";
import {
  createSession,
  getSession,
  startSession,
  stopSession,
  wahaClient,
  type WahaSession,
} from "./wahaClient";

const userId = new Types.ObjectId();
const apiKeyId = new Types.ObjectId();
const sessionName = `${userId.toString()}-${apiKeyId.toString()}`;

const originalPoll = { ...startingPoll };

const original = {
  assert: entitlementService.assertWhatsAppEntitled,
  updateOne: ApiKeyModel.updateOne,
  findById: ApiKeyModel.findById,
  findOne: ApiKeyModel.findOne,
  userFind: UserModel.findById,
  getSession: wahaClient.getSession,
  createSession: wahaClient.createSession,
  startSession: wahaClient.startSession,
  stopSession: wahaClient.stopSession,
  restartSession: wahaClient.restartSession,
  logoutSession: wahaClient.logoutSession,
  getQrPng: wahaClient.getQrPng,
  sendText: wahaClient.sendText,
  sendList: wahaClient.sendList,
  updateWebhooks: wahaClient.updateWebhooks,
  setPresence: wahaClient.setPresence,
  flowFind: WhatsAppFlowNodeModel.find,
  fetch: globalThis.fetch,
};

afterEach(() => {
  startingPoll.intervalMs = originalPoll.intervalMs;
  startingPoll.maxMs = originalPoll.maxMs;
  entitlementService.assertWhatsAppEntitled = original.assert;
  ApiKeyModel.updateOne = original.updateOne;
  ApiKeyModel.findById = original.findById;
  ApiKeyModel.findOne = original.findOne;
  UserModel.findById = original.userFind;
  wahaClient.getSession = original.getSession;
  wahaClient.createSession = original.createSession;
  wahaClient.startSession = original.startSession;
  wahaClient.stopSession = original.stopSession;
  wahaClient.restartSession = original.restartSession;
  wahaClient.logoutSession = original.logoutSession;
  wahaClient.getQrPng = original.getQrPng;
  wahaClient.sendText = original.sendText;
  wahaClient.sendList = original.sendList;
  wahaClient.updateWebhooks = original.updateWebhooks;
  wahaClient.setPresence = original.setPresence;
  WhatsAppFlowNodeModel.find = original.flowFind;
  globalThis.fetch = original.fetch;
});

function leanFindById(doc: unknown) {
  ApiKeyModel.findById = (() => ({
    lean: async () => doc,
  })) as typeof ApiKeyModel.findById;
}

function updates(): Array<{ filter: unknown; update: unknown }> {
  const calls: Array<{ filter: unknown; update: unknown }> = [];
  ApiKeyModel.updateOne = (async (filter: unknown, update: unknown) => {
    calls.push({ filter, update });
    return { matchedCount: 1, modifiedCount: 1 };
  }) as typeof ApiKeyModel.updateOne;
  return calls;
}

function stubOwner() {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  startingPoll.intervalMs = 0;
  UserModel.findById = (() => ({
    select() {
      return this;
    },
    lean: async () => ({ email: "ada@example.com" }),
  })) as unknown as typeof UserModel.findById;
}

function session(status: string, me: WahaSession["me"] = null): WahaSession {
  return { name: sessionName, status, me };
}

test("missing whatsAppSetting maps to defaults", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  leanFindById({ _id: apiKeyId });
  wahaClient.getSession = async () => {
    throw new Error("should not call WAHA");
  };
  const out = await whatsAppService.getSettings(userId, apiKeyId);
  assert.equal(out.enabled, false);
  assert.equal(out.sessionName, null);
  assert.equal(out.status, null);
  assert.equal(out.meId, null);
  assert.equal(out.mePushName, null);
  assert.equal(out.lastSyncedAt, null);
});

test("getSettings pulls WORKING from WAHA when stored status is SCAN_QR_CODE", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  let doc: {
    whatsAppSetting: {
      enabled: boolean;
      sessionName: string;
      status: string;
      meId: string | null;
      mePushName: string | null;
      lastSyncedAt: Date | null;
    };
  } = {
    whatsAppSetting: {
      enabled: true,
      sessionName,
      status: "SCAN_QR_CODE",
      meId: null,
      mePushName: null,
      lastSyncedAt: null,
    },
  };
  ApiKeyModel.findById = (() => ({
    lean: async () => doc,
  })) as typeof ApiKeyModel.findById;
  ApiKeyModel.updateOne = (async (_filter: unknown, update: unknown) => {
    const set = (update as { $set: Record<string, unknown> }).$set;
    doc = {
      whatsAppSetting: {
        ...doc.whatsAppSetting,
        status: set["whatsAppSetting.status"] as string,
        meId: (set["whatsAppSetting.meId"] as string | null) ?? null,
        mePushName: (set["whatsAppSetting.mePushName"] as string | null) ?? null,
        lastSyncedAt: set["whatsAppSetting.lastSyncedAt"] as Date,
      },
    };
    return { matchedCount: 1, modifiedCount: 1 };
  }) as typeof ApiKeyModel.updateOne;
  wahaClient.getSession = async () =>
    session("WORKING", { id: "1@c.us", pushName: "Ada" });

  const out = await whatsAppService.getSettings(userId, apiKeyId);
  assert.equal(out.status, "WORKING");
  assert.equal(out.meId, "1@c.us");
  assert.equal(out.mePushName, "Ada");
  assert.equal(typeof out.lastSyncedAt, "string");
});

test("enable creates a session and stores status without lastSyncedAt", async () => {
  stubOwner();
  const calls = updates();
  leanFindById({
    whatsAppSetting: {
      enabled: true,
      sessionName,
      status: "SCAN_QR_CODE",
      meId: null,
      mePushName: null,
      lastSyncedAt: null,
    },
  });
  let gets = 0;
  wahaClient.getSession = async () => {
    gets += 1;
    if (gets === 1) return null;
    if (gets === 2) return session("SCAN_QR_CODE");
    throw new Error("extra get");
  };
  let created = false;
  wahaClient.createSession = async (input) => {
    created = true;
    assert.equal(input.name, sessionName);
    assert.equal(input.metadata["user.email"], "ada@example.com");
    assert.equal("plan" in input.metadata, false);
    assert.equal(typeof input.metadata["user.id"], "string");
    assert.equal(typeof input.metadata["apiKey.id"], "string");
    assert.match(input.webhookUrl, new RegExp(`/whatsapp/webhook/${userId}/${apiKeyId}$`));
    return session("STARTING");
  };

  const out = await whatsAppService.updateSettings(userId, apiKeyId, {
    enabled: true,
  });
  assert.equal(created, true);
  assert.equal(gets, 2);
  assert.equal(out.status, "SCAN_QR_CODE");
  assert.equal(out.enabled, true);
  const sets = calls.map((call) => (call.update as { $set: Record<string, unknown> }).$set);
  assert.equal(sets[0]["whatsAppSetting.enabled"], true);
  assert.equal(sets[0]["whatsAppSetting.sessionName"], sessionName);
  assert.equal(sets[1]["whatsAppSetting.status"], "SCAN_QR_CODE");
  assert.equal("whatsAppSetting.lastSyncedAt" in sets[1], false);
});

test("poll stops on the first terminal status", async () => {
  stubOwner();
  updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "WORKING", sessionName },
  });
  const statuses = ["STARTING", "WORKING", "FAILED"];
  wahaClient.getSession = async () => session(statuses.shift() ?? "FAILED");
  wahaClient.startSession = async () => undefined;
  wahaClient.createSession = async () => session("STARTING");

  await whatsAppService.updateSettings(userId, apiKeyId, { enabled: true });
  assert.equal(statuses.length, 1);
});

test("STARTING past the poll cap is saved and stays enabled", async () => {
  stubOwner();
  startingPoll.maxMs = 0;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "STARTING", sessionName },
  });
  let gets = 0;
  wahaClient.getSession = async () => {
    gets += 1;
    return null;
  };
  wahaClient.createSession = async () => session("STARTING");

  const out = await whatsAppService.updateSettings(userId, apiKeyId, {
    enabled: true,
  });
  assert.equal(gets, 1);
  assert.equal(out.enabled, true);
  assert.equal(out.status, "STARTING");
  const sets = calls.map((call) => (call.update as { $set: Record<string, unknown> }).$set);
  assert.equal(sets.at(-1)?.["whatsAppSetting.status"], "STARTING");
  assert.equal(sets.some((set) => set["whatsAppSetting.enabled"] === false), false);
});

test("WAHA failure rolls enabled back to false", async () => {
  stubOwner();
  const calls = updates();
  wahaClient.getSession = async () => {
    throw new Error("WAHA unavailable");
  };

  await assert.rejects(
    () => whatsAppService.updateSettings(userId, apiKeyId, { enabled: true }),
    /WAHA unavailable/,
  );
  const sets = calls.map((call) => (call.update as { $set: Record<string, unknown> }).$set);
  assert.equal(sets[0]["whatsAppSetting.enabled"], true);
  assert.equal(sets[1]["whatsAppSetting.enabled"], false);
});

test("disable with a session stops it and saves the follow-up status", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "WORKING", sessionName },
  });
  let stopped = false;
  wahaClient.stopSession = async (name) => {
    stopped = true;
    assert.equal(name, sessionName);
    return "stopped";
  };
  wahaClient.getSession = async () => session("STOPPED");

  await whatsAppService.updateSettings(userId, apiKeyId, { enabled: false });
  assert.equal(stopped, true);
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.enabled"], false);
  assert.equal(set["whatsAppSetting.status"], "STOPPED");
  assert.equal("whatsAppSetting.lastSyncedAt" in set, false);
});

test("disable without a session does not call WAHA", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: null, sessionName: null },
  });
  wahaClient.stopSession = async () => {
    throw new Error("should not stop");
  };
  wahaClient.getSession = async () => {
    throw new Error("should not call WAHA");
  };

  await whatsAppService.updateSettings(userId, apiKeyId, { enabled: false });
  assert.equal(calls.length, 1);
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.deepEqual(set, { "whatsAppSetting.enabled": false });
});

test("stop 404 still disables and stores STOPPED", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "WORKING", sessionName },
  });
  wahaClient.stopSession = async () => "missing";
  wahaClient.getSession = async () => {
    throw new Error("should not get");
  };

  await whatsAppService.updateSettings(userId, apiKeyId, { enabled: false });
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.enabled"], false);
  assert.equal(set["whatsAppSetting.status"], "STOPPED");
});

test("existing session is started even when it is not STOPPED", async () => {
  stubOwner();
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "WORKING", sessionName },
  });
  let reads = 0;
  wahaClient.getSession = async () => {
    reads += 1;
    return session("WORKING");
  };
  let started = false;
  wahaClient.startSession = async (name) => {
    started = true;
    assert.equal(name, sessionName);
  };
  wahaClient.createSession = async () => {
    throw new Error("should not create");
  };

  await whatsAppService.updateSettings(userId, apiKeyId, { enabled: true });
  assert.equal(started, true);
  assert.equal(reads, 2);
  const statusSet = calls[1].update as { $set: Record<string, unknown> };
  assert.equal(statusSet.$set["whatsAppSetting.status"], "WORKING");
});

test("QR is refused unless the session is ready to scan", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  leanFindById({
    whatsAppSetting: { enabled: true, status: "WORKING", sessionName },
  });
  wahaClient.getQrPng = async () => {
    throw new Error("should not fetch QR");
  };
  await assert.rejects(
    () => whatsAppService.getQr(userId, apiKeyId),
    /not ready to scan/,
  );
});

test("logout saves the follow-up session status", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  startingPoll.intervalMs = 0;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "SCAN_QR_CODE", sessionName },
  });
  let loggedOut = false;
  wahaClient.logoutSession = async (name) => {
    loggedOut = true;
    assert.equal(name, sessionName);
  };
  wahaClient.getSession = async () => session("SCAN_QR_CODE");

  await whatsAppService.logout(userId, apiKeyId);
  assert.equal(loggedOut, true);
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.status"], "SCAN_QR_CODE");
});

test("restart saves the polled status", async () => {
  entitlementService.assertWhatsAppEntitled = async () => undefined;
  startingPoll.intervalMs = 0;
  const calls = updates();
  leanFindById({
    whatsAppSetting: { enabled: true, status: "FAILED", sessionName },
  });
  let restarted = false;
  wahaClient.restartSession = async (name) => {
    restarted = true;
    assert.equal(name, sessionName);
  };
  let reads = 0;
  wahaClient.getSession = async () => {
    reads += 1;
    return reads === 1 ? session("STARTING") : session("SCAN_QR_CODE");
  };

  await whatsAppService.restart(userId, apiKeyId);
  assert.equal(restarted, true);
  assert.equal(reads, 2);
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.status"], "SCAN_QR_CODE");
});

test("webhookEventTime treats small numbers as seconds", () => {
  const fromSeconds = webhookEventTime(1_710_000_000);
  assert.equal(fromSeconds.getTime(), 1_710_000_000_000);
  const fromMs = webhookEventTime(1_710_000_000_000);
  assert.equal(fromMs.getTime(), 1_710_000_000_000);
});

test("session.status update is conditional on lastSyncedAt", async () => {
  const calls = updates();
  const eventMs = 1_710_000_000_000;
  await whatsAppService.applySessionStatus(apiKeyId, {
    event: "session.status",
    timestamp: eventMs,
    payload: { status: "WORKING" },
    me: { id: "1@c.us", pushName: "Ada" },
  });
  const call = calls[0];
  const filter = call.filter as {
    $or: Array<Record<string, unknown>>;
  };
  assert.equal(
    (filter.$or[2]["whatsAppSetting.lastSyncedAt"] as { $lte: Date }).$lte.getTime(),
    eventMs,
  );
  const set = (call.update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.status"], "WORKING");
  assert.equal(set["whatsAppSetting.meId"], "1@c.us");
  assert.equal(set["whatsAppSetting.mePushName"], "Ada");
});

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, state };
}

function webhookReq(
  secret: string,
  body: unknown,
  ids: { userId?: string; apiKeyId?: string } = {},
): Request {
  return {
    get(name: string) {
      return name.toLowerCase() === "x-webhook-secret" ? secret : undefined;
    },
    params: {
      userId: ids.userId ?? userId.toString(),
      apiKeyId: ids.apiKeyId ?? apiKeyId.toString(),
    },
    body,
  } as unknown as Request;
}

test("webhook rejects a bad secret", async () => {
  const { res, state } = mockRes();
  await whatsAppController.webhook(webhookReq("nope", {}), res);
  assert.equal(state.statusCode, 401);
});

test("webhook 404s on session mismatch and does not write", async () => {
  const calls = updates();
  const { res, state } = mockRes();
  const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
  await whatsAppController.webhook(
    webhookReq(secret, { event: "session.status", session: "other" }),
    res,
  );
  assert.equal(state.statusCode, 404);
  assert.equal(calls.length, 0);
});

test("webhook 404s when the key owner or session name does not match", async () => {
  const calls = updates();
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => null,
  })) as unknown as typeof ApiKeyModel.findOne;
  const { res, state } = mockRes();
  const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
  await whatsAppController.webhook(
    webhookReq(secret, { event: "session.status", session: sessionName }),
    res,
  );
  assert.equal(state.statusCode, 404);
  assert.equal(calls.length, 0);
});

test("webhook ignores message events with 200", async () => {
  const calls = updates();
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => ({
      whatsAppSetting: { sessionName },
    }),
  })) as unknown as typeof ApiKeyModel.findOne;
  const { res, state } = mockRes();
  const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
  await whatsAppController.webhook(
    webhookReq(secret, {
      event: "message",
      session: sessionName,
      payload: { body: "private" },
    }),
    res,
  );
  assert.equal(state.statusCode, 200);
  assert.equal(calls.length, 0);
});

test("webhook message replies through the whatsapp agent and ignores fromMe", async () => {
  const originalRun = agentService.runAgentTurn;
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  let mode: string | undefined;
  let runs = 0;
  let sent: { session: string; chatId: string; text: string } | null = null;
  const presence: Array<"typing" | "paused"> = [];
  agentService.runAgentTurn = (async function* (params: {
    executionMode?: string;
  }) {
    runs += 1;
    mode = params.executionMode;
    yield { type: "token" as const, text: "[[LIVE_AGENT_OFFER]] **Hello**" };
  }) as typeof agentService.runAgentTurn;
  ChatSessionModel.findOne = (async () => ({
    _id: new Types.ObjectId(),
    expiredAt: new Date(Date.now() + 60_000),
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  })) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendText = async (session, chatId, text) => {
    sent = { session, chatId, text };
  };
  wahaClient.setPresence = async (_session, _chatId, next) => {
    presence.push(next);
  };
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => ({
      whatsAppSetting: { sessionName, enabled: true },
    }),
  })) as unknown as typeof ApiKeyModel.findOne;

  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    const chat = "6281@c.us";
    const { res, state } = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: chat, fromMe: false, body: "Hi" },
      }),
      res,
    );
    assert.equal(state.statusCode, 200);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runs, 1);
    assert.equal(mode, "whatsapp");
    assert.deepEqual(sent, { session: sessionName, chatId: chat, text: "*Hello*" });
    assert.deepEqual(presence, ["typing", "paused"]);

    const again = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: chat, fromMe: true, body: "Hello" },
      }),
      again.res,
    );
    assert.equal(again.state.statusCode, 200);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runs, 1);

    const lid = "265958048424027@lid";
    const lidRes = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: lid, fromMe: false, body: "Hi" },
      }),
      lidRes.res,
    );
    assert.equal(lidRes.state.statusCode, 200);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runs, 2);
    assert.equal(mode, "whatsapp");
    assert.deepEqual(sent, { session: sessionName, chatId: lid, text: "*Hello*" });
    assert.deepEqual(presence, ["typing", "paused", "typing", "paused"]);
  } finally {
    agentService.runAgentTurn = originalRun;
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

async function deliverMessage(defaultFlow: boolean): Promise<{
  runs: number;
  sent: { session: string; chatId: string; text: string } | null;
}> {
  const originalRun = agentService.runAgentTurn;
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  let runs = 0;
  let sent: { session: string; chatId: string; text: string } | null = null;
  agentService.runAgentTurn = (async function* () {
    runs += 1;
    yield { type: "token" as const, text: "Hello" };
  }) as typeof agentService.runAgentTurn;
  ChatSessionModel.findOne = (async () => ({
    _id: new Types.ObjectId(),
    expiredAt: new Date(Date.now() + 60_000),
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  })) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendText = async (session, chatId, text) => {
    sent = { session, chatId, text };
  };
  wahaClient.setPresence = async () => undefined;
  WhatsAppFlowNodeModel.find = (() => ({
    sort() {
      return this;
    },
    lean: async () => [],
  })) as typeof WhatsAppFlowNodeModel.find;
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => ({
      whatsAppSetting: { sessionName, enabled: true, defaultFlow },
    }),
  })) as unknown as typeof ApiKeyModel.findOne;
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    const { res, state } = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: "6281@c.us", fromMe: false, body: "Hi" },
      }),
      res,
    );
    assert.equal(state.statusCode, 200);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return { runs, sent };
  } finally {
    agentService.runAgentTurn = originalRun;
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
    WhatsAppFlowNodeModel.find = original.flowFind;
  }
}

const flowMenuId = "menu-root";
const flowTextId = "leaf-text";
const flowFnId = "leaf-fn";

const flowDocs = [
  {
    id: flowMenuId,
    type: "menu" as const,
    root: true,
    header: "Pick one",
    options: [
      { label: "Hello", targetNodeId: flowTextId },
      { label: "Skip", targetNodeId: flowFnId },
    ],
  },
  {
    id: flowTextId,
    type: "leaf" as const,
    root: false,
    leafType: "text" as const,
    body: "Thanks",
  },
  {
    id: flowFnId,
    type: "leaf" as const,
    root: false,
    leafType: "function_call" as const,
    functionName: "ping",
    parameters: "",
  },
];

function mockFlowDocs() {
  WhatsAppFlowNodeModel.find = (() => ({
    sort() {
      return this;
    },
    lean: async () => flowDocs,
  })) as typeof WhatsAppFlowNodeModel.find;
}

function mockFlowKey(defaultFlow: boolean) {
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => ({
      whatsAppSetting: { sessionName, enabled: true, defaultFlow },
    }),
  })) as unknown as typeof ApiKeyModel.findOne;
}

test("webhook flow off uses the agent and does not send a list", async () => {
  const originalRun = agentService.runAgentTurn;
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  let runs = 0;
  let lists = 0;
  agentService.runAgentTurn = (async function* () {
    runs += 1;
    yield { type: "token" as const, text: "Hello" };
  }) as typeof agentService.runAgentTurn;
  ChatSessionModel.findOne = (async () => ({
    _id: new Types.ObjectId(),
    expiredAt: new Date(Date.now() + 60_000),
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    matchedCount: 1,
    modifiedCount: 1,
  })) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendText = async () => undefined;
  wahaClient.sendList = async () => {
    lists += 1;
  };
  wahaClient.setPresence = async () => undefined;
  mockFlowKey(false);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    const { res, state } = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: "6281@c.us", fromMe: false, body: "Hi" },
      }),
      res,
    );
    assert.equal(state.statusCode, 200);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(runs, 1);
    assert.equal(lists, 0);
  } finally {
    agentService.runAgentTurn = originalRun;
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

test("webhook flow on with no open menu sends the root list", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  const texts: string[] = [];
  let list: {
    title: string;
    description: string;
    button: string;
    sections: { title: string; rows: { title: string; rowId: string; description: null }[] }[];
  } | null = null;
  const saved: { pollId?: unknown; nodeId?: unknown } = {};
  ChatSessionModel.findOne = (async () => null) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async (_filter: unknown, update: { $set?: Record<string, unknown> }) => {
    saved.pollId = update.$set?.flowActivePollId;
    saved.nodeId = update.$set?.flowActiveNodeId;
    return { matchedCount: 1, modifiedCount: 1 };
  }) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendText = async (_session, _chatId, text) => {
    texts.push(text);
  };
  wahaClient.sendList = async (_session, _chatId, message) => {
    list = message;
  };
  mockFlowDocs();
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    const { res } = mockRes();
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: "6281@c.us", fromMe: false, body: "Hi" },
      }),
      res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(texts, []);
    assert.deepEqual(list, {
      title: "Pick one",
      description: "Pick one",
      button: "Choose",
      sections: [
        {
          title: "Main",
          rows: [
            { title: "Hello", rowId: "Hello", description: null },
            { title: "Skip", rowId: "Skip", description: null },
          ],
        },
      ],
    });
    assert.equal(saved.pollId, "list");
    assert.equal(saved.nodeId, flowMenuId);
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

test("webhook flow on ignores text while a list is open", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  let texts = 0;
  let lists = 0;
  ChatSessionModel.findOne = (async () => ({
    flowActivePollId: "list",
    flowActiveNodeId: flowMenuId,
  })) as typeof ChatSessionModel.findOne;
  wahaClient.sendText = async () => {
    texts += 1;
  };
  wahaClient.sendList = async () => {
    lists += 1;
  };
  mockFlowDocs();
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: "6281@c.us", fromMe: false, body: "Hi" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(texts, 0);
    assert.equal(lists, 0);
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
  }
});

test("webhook list reply follows the label", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  const texts: string[] = [];
  const lists: Array<{
    description: string;
    sections: { rows: { title: string }[] }[];
  }> = [];
  ChatSessionModel.findOne = (async () => ({
    flowActivePollId: "list",
    flowActiveNodeId: flowMenuId,
    flowSeenVoteIds: [],
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    matchedCount: 1,
  })) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendText = async (_session, _chatId, text) => {
    texts.push(text);
  };
  wahaClient.sendList = async (_session, _chatId, message) => {
    lists.push(message);
  };
  mockFlowDocs();
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { id: "msg-1", from: "6281@c.us", fromMe: false, body: "Hello" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(texts, []);
    assert.equal(lists[0]?.description, "Thanks");
    assert.equal(lists[0]?.sections[0]?.rows[0]?.title, "Back");
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

test("webhook non-root list has Back and Back returns to the previous node", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  const rootId = "menu-root";
  const childId = "menu-child";
  const lists: Array<{
    title: string;
    sections: { rows: { title: string }[] }[];
  }> = [];
  WhatsAppFlowNodeModel.find = (() => ({
    sort() {
      return this;
    },
    lean: async () => [
      {
        id: rootId,
        type: "menu",
        root: true,
        header: "Pick one",
        options: [{ label: "Next", targetNodeId: childId }],
      },
      {
        id: childId,
        type: "menu",
        root: false,
        header: "More",
        options: [{ label: "Nope", targetNodeId: rootId }],
      },
    ],
  })) as typeof WhatsAppFlowNodeModel.find;
  ChatSessionModel.findOne = (async () => ({
    _id: new Types.ObjectId(),
    flowActivePollId: "list",
    flowActiveNodeId: rootId,
    flowSeenVoteIds: [],
    flowBackStack: [],
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    matchedCount: 1,
  })) as unknown as typeof ChatSessionModel.updateOne;
  wahaClient.sendList = async (_session, _chatId, message) => {
    lists.push(message);
  };
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { id: "msg-next", from: "6281@c.us", fromMe: false, body: "Next" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(
      lists[0]?.sections[0]?.rows.map((row) => row.title),
      ["Nope", "Back"],
    );

    lists.length = 0;
    ChatSessionModel.findOne = (async () => ({
      _id: new Types.ObjectId(),
      flowActivePollId: "list",
      flowActiveNodeId: childId,
      flowSeenVoteIds: [],
      flowBackStack: [rootId],
    })) as typeof ChatSessionModel.findOne;
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { id: "msg-back", from: "6281@c.us", fromMe: false, body: "Back" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(lists[0]?.title, "Pick one");
    assert.deepEqual(
      lists[0]?.sections[0]?.rows.map((row) => row.title),
      ["Next"],
    );
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

test("webhook form leaf asks for required lead fields", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalContext = leadCaptureService.agentContext;
  const texts: string[] = [];
  const sessionId = new Types.ObjectId();
  ChatSessionModel.findOne = (async () => ({ _id: sessionId })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    matchedCount: 1,
  })) as unknown as typeof ChatSessionModel.updateOne;
  leadCaptureService.agentContext = (async () => ({
    strategy: "subtle",
    fields: [
      {
        id: "1",
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        order: 0,
      },
    ],
    gathered: {},
    missingRequired: ["email"],
  })) as typeof leadCaptureService.agentContext;
  wahaClient.sendText = async (_session, _chatId, text) => {
    texts.push(text);
  };
  WhatsAppFlowNodeModel.find = (() => ({
    sort() {
      return this;
    },
    lean: async () => [
      {
        id: "form-1",
        type: "leaf",
        root: true,
        leafType: "form",
        fields: [],
      },
    ],
  })) as typeof WhatsAppFlowNodeModel.find;
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { from: "6281@c.us", fromMe: false, body: "Hi" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(texts, ["Please reply with:\nEmail:"]);
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    leadCaptureService.agentContext = originalContext;
    WhatsAppFlowNodeModel.find = original.flowFind;
  }
});

test("webhook form reply saves the required field", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  const originalContext = leadCaptureService.agentContext;
  const originalApply = leadCaptureService.applyAgentAction;
  const texts: string[] = [];
  const saved: Record<string, string>[] = [];
  const sessionId = new Types.ObjectId();
  ChatSessionModel.findOne = (async () => ({
    _id: sessionId,
    flowActivePollId: "form",
    flowActiveNodeId: "form-1",
  })) as typeof ChatSessionModel.findOne;
  ChatSessionModel.updateOne = (async () => ({
    matchedCount: 1,
  })) as unknown as typeof ChatSessionModel.updateOne;
  leadCaptureService.agentContext = (async () => ({
    strategy: "subtle",
    fields: [
      {
        id: "1",
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        order: 0,
      },
    ],
    gathered: {},
    missingRequired: ["email"],
  })) as typeof leadCaptureService.agentContext;
  leadCaptureService.applyAgentAction = (async (_user, _key, input) => {
    saved.push(input.fields);
    return {
      submitted: input.action === "submit",
      status: input.action === "submit" ? "lead" : "gathering",
      missingRequired: [],
      ask: "now",
      gathered: input.fields,
      instruction: "",
      alreadyCaptured: false,
    };
  }) as typeof leadCaptureService.applyAgentAction;
  wahaClient.sendText = async (_session, _chatId, text) => {
    texts.push(text);
  };
  WhatsAppFlowNodeModel.find = (() => ({
    sort() {
      return this;
    },
    lean: async () => [
      {
        id: "form-1",
        type: "leaf",
        root: true,
        leafType: "form",
        fields: [],
      },
    ],
  })) as typeof WhatsAppFlowNodeModel.find;
  mockFlowKey(true);
  try {
    const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
    await whatsAppController.webhook(
      webhookReq(secret, {
        event: "message",
        session: sessionName,
        payload: { id: "msg-form", from: "6281@c.us", fromMe: false, body: "ada@example.com" },
      }),
      mockRes().res,
    );
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(saved[0], { email: "ada@example.com" });
    assert.equal(saved[1] ? Object.keys(saved[1]).length : -1, 0);
    assert.deepEqual(texts, ["Saved."]);
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
    leadCaptureService.agentContext = originalContext;
    leadCaptureService.applyAgentAction = originalApply;
  }
});

test("webhook poll vote follows the label and ignores repeats", async () => {
  const originalSessionFind = ChatSessionModel.findOne;
  const originalSessionUpdate = ChatSessionModel.updateOne;
  const texts: string[] = [];
  const lists: Array<{
    description: string;
    sections: { rows: { title: string }[] }[];
  }> = [];
  const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
  const chat = "6281@c.us";
  wahaClient.sendText = async (_session, _chatId, text) => {
    texts.push(text);
  };
  wahaClient.sendList = async (_session, _chatId, message) => {
    lists.push(message);
  };
  mockFlowDocs();
  mockFlowKey(true);

  function vote(voteId: string, pollId: string, selected: string[]) {
    return whatsAppController.webhook(
      webhookReq(secret, {
        event: "poll.vote",
        session: sessionName,
        payload: {
          vote: { id: voteId, from: chat, selectedOptions: selected },
          poll: { id: pollId },
        },
      }),
      mockRes().res,
    );
  }

  try {
    ChatSessionModel.findOne = (async () => ({
      flowActivePollId: "poll-1",
      flowActiveNodeId: flowMenuId,
      flowSeenVoteIds: [],
    })) as typeof ChatSessionModel.findOne;
    ChatSessionModel.updateOne = (async () => ({
      matchedCount: 1,
    })) as unknown as typeof ChatSessionModel.updateOne;
    await vote("vote-1", "poll-1", ["Hello"]);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(texts, []);
    assert.equal(lists[0]?.description, "Thanks");
    assert.equal(lists[0]?.sections[0]?.rows[0]?.title, "Back");

    texts.length = 0;
    lists.length = 0;
    ChatSessionModel.findOne = (async () => ({
      flowActivePollId: "poll-1",
      flowActiveNodeId: flowMenuId,
      flowSeenVoteIds: ["vote-1"],
    })) as typeof ChatSessionModel.findOne;
    await vote("vote-1", "poll-1", ["Hello"]);
    await vote("vote-2", "poll-1", []);
    await vote("vote-3", "other-poll", ["Hello"]);
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(texts, []);
    assert.equal(lists.length, 0);

    ChatSessionModel.findOne = (async () => ({
      flowActivePollId: "poll-1",
      flowActiveNodeId: flowMenuId,
      flowSeenVoteIds: [],
    })) as typeof ChatSessionModel.findOne;
    lists.length = 0;
    const originalCall = mcpService.callEnabledTool;
    const originalSummarize = flowLlm.summarize;
    mcpService.callEnabledTool = (async () => ({
      name: "ping",
      mcpId: "mcp",
      result: { ok: true },
      isError: false,
      raw: { content: [], isError: false },
    })) as unknown as typeof mcpService.callEnabledTool;
    flowLlm.summarize = async () => "Pong";
    try {
      await vote("vote-4", "poll-1", ["Skip"]);
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.deepEqual(texts, []);
      assert.equal(lists[0]?.description, "Pong");
      assert.equal(lists[0]?.sections[0]?.rows[0]?.title, "Back");
    } finally {
      mcpService.callEnabledTool = originalCall;
      flowLlm.summarize = originalSummarize;
    }
  } finally {
    ChatSessionModel.findOne = originalSessionFind;
    ChatSessionModel.updateOne = originalSessionUpdate;
  }
});

test("webhook defaultFlow false replies through the agent", async () => {
  const { runs, sent } = await deliverMessage(false);
  assert.equal(runs, 1);
  assert.deepEqual(sent, { session: sessionName, chatId: "6281@c.us", text: "Hello" });
});

test("webhook defaultFlow true skips the agent and does not send", async () => {
  const { runs, sent } = await deliverMessage(true);
  assert.equal(runs, 0);
  assert.equal(sent, null);
});

test("webhook applies session.status", async () => {
  const calls = updates();
  ApiKeyModel.findOne = (() => ({
    select() {
      return this;
    },
    lean: async () => ({
      whatsAppSetting: { sessionName },
    }),
  })) as unknown as typeof ApiKeyModel.findOne;
  const { res, state } = mockRes();
  const secret = process.env.WAHA_WEBHOOK_SECRET ?? "";
  await whatsAppController.webhook(
    webhookReq(secret, {
      event: "session.status",
      session: sessionName,
      timestamp: 1_710_000_000_000,
      payload: { status: "WORKING" },
      me: { id: "1@c.us", pushName: "Ada" },
    }),
    res,
  );
  assert.equal(state.statusCode, 200);
  const set = (calls[0].update as { $set: Record<string, unknown> }).$set;
  assert.equal(set["whatsAppSetting.status"], "WORKING");
});

test("create 4xx re-reads the session instead of throwing", async () => {
  const existing = session("WORKING", { id: "9@c.us", pushName: "Ada" });
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/api/sessions")) {
      return new Response(JSON.stringify({ message: "already exists" }), {
        status: 422,
      });
    }
    if (url.includes("/api/sessions/")) {
      return new Response(JSON.stringify(existing), { status: 200 });
    }
    return new Response("no", { status: 500 });
  }) as typeof fetch;

  const result = await createSession({
    name: "race",
    metadata: { "user.id": "u", "user.email": "a@b.c", "apiKey.id": "k" },
    webhookUrl: "http://192.168.1.2:8000/whatsapp/webhook/u/k",
  });
  assert.equal(result.status, "WORKING");
  assert.equal(result.me?.pushName, "Ada");
});

test("startSession ignores a 4xx and stopSession maps 404 to missing", async () => {
  globalThis.fetch = (async () =>
    new Response("already running", { status: 422 })) as typeof fetch;
  await startSession("running");

  globalThis.fetch = (async () =>
    new Response("missing", { status: 404 })) as typeof fetch;
  assert.equal(await stopSession("gone"), "missing");
});

test("getSession maps 404 to null and timeouts are explicit", async () => {
  globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;
  assert.equal(await getSession("missing"), null);

  globalThis.fetch = (async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;
  await assert.rejects(() => getSession("x"), /WAHA request timed out/);

  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as typeof fetch;
  await assert.rejects(() => getSession("x"), /WAHA unavailable/);
});

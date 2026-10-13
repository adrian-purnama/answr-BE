import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { Types } from "mongoose";
import type { LeadFieldConfig } from "../../models/leadCapture/leadCapture.interface";

process.env.MONGODB_URL ??= "mongodb://localhost/test";
process.env.FRONTEND_URL ??= "https://app.example.com";
process.env.SMTP_HOST ??= "smtp.example.com";
process.env.SMTP_PORT ??= "465";
process.env.SMTP_SECURE ??= "true";
process.env.SMTP_USER ??= "test@example.com";
process.env.SMTP_PASSWORD ??= "test";
process.env.MAIL_FROM ??= "test@example.com";
process.env.JWT_SECRET ??= "test-secret";
process.env.BUILD ??= "development";
process.env.MIDTRANS_SERVER_KEY ??= "SB-Mid-server-test";
process.env.MIDTRANS_CLIENT_KEY ??= "SB-Mid-client-test";


const fields: LeadFieldConfig[] = [
  {
    id: "email",
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    order: 0,
  },
  {
    id: "phone",
    key: "phone",
    label: "Phone",
    type: "phone",
    required: false,
    order: 1,
  },
];

type EntitlementMod = typeof import("../entitlement/entitlement.service.js");
type ApiKeyModelType =
  typeof import("../../models/apiKey/apiKey.model.js").ApiKeyModel;
type LeadModelType =
  typeof import("../../models/leadCapture/lead.model.js").LeadModel;
type SessionModelType =
  typeof import("../../models/chatSession/chatSession.model.js").ChatSessionModel;
type ServiceMod = typeof import("./leadCapture.service.js");

let entitlementService: EntitlementMod["entitlementService"];
let ApiKeyModel: ApiKeyModelType;
let LeadModel: LeadModelType;
let ChatSessionModel: SessionModelType;
let leadCaptureService: ServiceMod["leadCaptureService"];

let originalAssert: EntitlementMod["entitlementService"]["assertLeadCaptureEntitled"];
let originalSettingsFind: ApiKeyModelType["findById"];
let originalLeadFind: LeadModelType["findOne"];
let originalLeadUpdate: LeadModelType["findOneAndUpdate"];
let originalLeadCount: LeadModelType["countDocuments"];
let originalLeadDelete: LeadModelType["findOneAndDelete"];
let originalSessionFind: SessionModelType["findOne"];

const userId = new Types.ObjectId();
const apiKeyId = new Types.ObjectId();
const sessionId = new Types.ObjectId();
const otherProjectId = new Types.ObjectId();

before(async () => {
  ({ entitlementService } = await import("../entitlement/entitlement.service.js"));
  ({ ApiKeyModel } = await import("../../models/apiKey/apiKey.model.js"));
  ({ LeadModel } = await import("../../models/leadCapture/lead.model.js"));
  ({ ChatSessionModel } = await import(
    "../../models/chatSession/chatSession.model.js"
  ));
  ({ leadCaptureService } = await import("./leadCapture.service.js"));
  originalAssert = entitlementService.assertLeadCaptureEntitled.bind(
    entitlementService,
  );
  originalSettingsFind = ApiKeyModel.findById;
  originalLeadFind = LeadModel.findOne;
  originalLeadUpdate = LeadModel.findOneAndUpdate;
  originalLeadCount = LeadModel.countDocuments;
  originalLeadDelete = LeadModel.findOneAndDelete;
  originalSessionFind = ChatSessionModel.findOne;
});

afterEach(() => {
  entitlementService.assertLeadCaptureEntitled = originalAssert;
  ApiKeyModel.findById = originalSettingsFind;
  LeadModel.findOne = originalLeadFind;
  LeadModel.findOneAndUpdate = originalLeadUpdate;
  LeadModel.countDocuments = originalLeadCount;
  LeadModel.findOneAndDelete = originalLeadDelete;
  ChatSessionModel.findOne = originalSessionFind;
});

function settings(enabled: boolean) {
  ApiKeyModel.findById = (() => ({
    lean: async () => ({
      leadCaptureSetting: {
        enabled,
        strategy: "subtle",
        fields,
      },
    }),
  })) as unknown as ApiKeyModelType["findById"];
}

function sessionFor(projectId: Types.ObjectId | null) {
  let query: Record<string, unknown> | undefined;
  ChatSessionModel.findOne = ((filter: Record<string, unknown>) => {
    query = filter;
    const matches =
      projectId !== null &&
      filter.apiKeyId === projectId;
    return {
      lean: async () => (matches ? { userId } : null),
    };
  }) as unknown as SessionModelType["findOne"];
  return () => query;
}

test("denied entitlement does not read settings or write a lead", async () => {
  let settingsReads = 0;
  let writes = 0;
  entitlementService.assertLeadCaptureEntitled = async () => {
    throw new Error("Your plan does not include Lead Capture");
  };
  ApiKeyModel.findById = (() => {
    settingsReads += 1;
    return { lean: async () => null };
  }) as unknown as ApiKeyModelType["findById"];
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  await assert.rejects(
    () =>
      leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId: sessionId.toString(),
        action: "record",
        fields: { email: "ada@example.com" },
      }),
    /does not include Lead Capture/,
  );
  assert.equal(settingsReads, 0);
  assert.equal(writes, 0);
});

test("disabled lead capture does not write", async () => {
  let writes = 0;
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(false);
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  await assert.rejects(
    () =>
      leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId: sessionId.toString(),
        action: "submit",
        qualification: "lead",
        fields: { email: "ada@example.com" },
      }),
    /not enabled/,
  );
  assert.equal(writes, 0);
});

test("creates a lead for the chat session when required fields are present", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  const readQuery = sessionFor(apiKeyId);
  LeadModel.findOne = (() => ({
    lean: async () => null,
  })) as unknown as LeadModelType["findOne"];
  LeadModel.countDocuments = (async () => 0) as unknown as LeadModelType["countDocuments"];

  let update: { filter?: Record<string, unknown>; set?: Record<string, unknown> } =
    {};
  LeadModel.findOneAndUpdate = (async (
    filter: Record<string, unknown>,
    doc: { $set: Record<string, unknown> },
  ) => {
    update = { filter, set: doc.$set };
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  const result = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
    sessionId: sessionId.toString(),
    action: "submit",
    qualification: "lead",
    fields: { email: "ada@example.com" },
    summary: "Asked about pricing",
  });

  assert.equal(result.submitted, true);
  assert.equal(result.status, "lead");
  assert.equal(readQuery()?.apiKeyId, apiKeyId);
  assert.equal(String(update.filter?.chatSessionId), sessionId.toString());
  assert.equal(String(update.filter?.apiKeyId), apiKeyId.toString());
  assert.equal(update.set?.status, "lead");
  assert.equal(update.set?.summary, "Asked about pricing");
});

test("updates the same chat session lead and keeps earlier fields", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  sessionFor(apiKeyId);
  LeadModel.findOne = (() => ({
    lean: async () => ({
      status: "lead",
      summary: "Asked about pricing",
      fieldValues: [
        {
          fieldId: "email",
          key: "email",
          label: "Email",
          value: "ada@example.com",
        },
      ],
    }),
  })) as unknown as LeadModelType["findOne"];

  let set: Record<string, unknown> = {};
  let filter: Record<string, unknown> = {};
  LeadModel.findOneAndUpdate = (async (
    nextFilter: Record<string, unknown>,
    doc: { $set: Record<string, unknown> },
  ) => {
    filter = nextFilter;
    set = doc.$set;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  const result = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
    sessionId: sessionId.toString(),
    action: "submit",
    qualification: "hot",
    fields: { phone: "5551234567" },
  });

  assert.equal(result.submitted, true);
  assert.equal(result.status, "hot");
  assert.equal(result.gathered.email, "ada@example.com");
  assert.equal(result.gathered.phone, "5551234567");
  assert.equal(String(filter.chatSessionId), sessionId.toString());
  assert.equal(set.status, "hot");
  assert.equal(set.summary, "Asked about pricing");
});

test("cross-project session is rejected without a write", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  const readQuery = sessionFor(otherProjectId);
  let writes = 0;
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  await assert.rejects(
    () =>
      leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId: sessionId.toString(),
        action: "submit",
        qualification: "lead",
        fields: { email: "ada@example.com" },
      }),
    /Chat session not found/,
  );
  assert.equal(String(readQuery()?.apiKeyId), apiKeyId.toString());
  assert.notEqual(String(readQuery()?.apiKeyId), otherProjectId.toString());
  assert.equal(writes, 0);
});

test("does not insert when no fields were accepted", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  sessionFor(apiKeyId);
  LeadModel.findOne = (() => ({
    lean: async () => null,
  })) as unknown as LeadModelType["findOne"];
  let writes = 0;
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  const result = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
    sessionId: sessionId.toString(),
    action: "record",
    fields: {},
  });

  assert.equal(result.submitted, false);
  assert.equal(result.alreadyCaptured, false);
  assert.equal(writes, 0);
});

test("a second session with the same email does not insert", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  sessionFor(apiKeyId);
  LeadModel.findOne = ((filter: Record<string, unknown>) => ({
    lean: async () =>
      "status" in filter
        ? {
            status: "lead",
            chatSessionId: new Types.ObjectId(),
            fieldValues: [
              {
                fieldId: "email",
                key: "email",
                label: "Email",
                value: "ada@example.com",
              },
            ],
          }
        : null,
  })) as unknown as LeadModelType["findOne"];
  let writes = 0;
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  const result = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
    sessionId: sessionId.toString(),
    action: "submit",
    qualification: "lead",
    fields: { email: "Ada@Example.com" },
  });

  assert.equal(result.submitted, false);
  assert.equal(result.alreadyCaptured, true);
  assert.match(result.instruction, /already saved/);
  assert.equal(writes, 0);
});

test("hourly cap refuses a new lead", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  sessionFor(apiKeyId);
  LeadModel.findOne = (() => ({
    lean: async () => null,
  })) as unknown as LeadModelType["findOne"];
  LeadModel.countDocuments = (async () =>
    20) as unknown as LeadModelType["countDocuments"];
  let writes = 0;
  LeadModel.findOneAndUpdate = (async () => {
    writes += 1;
    return null;
  }) as unknown as LeadModelType["findOneAndUpdate"];

  await assert.rejects(
    () =>
      leadCaptureService.applyAgentAction(userId, apiKeyId, {
        sessionId: sessionId.toString(),
        action: "submit",
        qualification: "lead",
        fields: { email: "ada@example.com" },
      }),
    /limit reached/,
  );
  assert.equal(writes, 0);
});

test("delete is project-scoped", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  const leadId = new Types.ObjectId();
  let filter: Record<string, unknown> = {};
  LeadModel.findOneAndDelete = ((next: Record<string, unknown>) => {
    filter = next;
    return { lean: async () => null };
  }) as unknown as LeadModelType["findOneAndDelete"];

  await assert.rejects(
    () => leadCaptureService.deleteLead(userId, apiKeyId, leadId),
    /Lead not found/,
  );
  assert.equal(String(filter._id), leadId.toString());
  assert.equal(String(filter.apiKeyId), apiKeyId.toString());
});

test("the first submit enqueues a lead summary job without calling the LLM", async () => {
  entitlementService.assertLeadCaptureEntitled = async () => undefined;
  settings(true);
  sessionFor(apiKeyId);
  LeadModel.findOne = (() => ({
    lean: async () => null,
  })) as unknown as LeadModelType["findOne"];
  LeadModel.countDocuments = (async () => 0) as unknown as LeadModelType["countDocuments"];

  let updateSet: Record<string, unknown> | undefined;
  LeadModel.findOneAndUpdate = (async (
    _filter: unknown,
    update: { $set?: Record<string, unknown> },
  ) => {
    updateSet = update.$set;
    return { _id: new Types.ObjectId() };
  }) as unknown as LeadModelType["findOneAndUpdate"];

  const result = await leadCaptureService.applyAgentAction(userId, apiKeyId, {
    sessionId: sessionId.toString(),
    action: "submit",
    qualification: "lead",
    fields: { email: "ada@example.com" },
  });

  assert.equal(result.submitted, true);
  assert.equal(updateSet?.summaryJobStatus, "pending");
  assert.equal(updateSet?.summaryJobAttempts, 0);
  assert.equal(updateSet?.summaryJobLastError, "");
  assert.ok(updateSet?.summaryJobNextAt instanceof Date);
});

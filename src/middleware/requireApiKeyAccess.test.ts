import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import {
  API_KEY_PERMISSION_VALUES,
  defaultCollaboratorPermissions,
} from "../models/apiKeyCollaborator/apiKeyCollaborator.interface.js";

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


type ApiKeyModelType =
  typeof import("../models/apiKey/apiKey.model.js").ApiKeyModel;
type CollaboratorServiceMod =
  typeof import("../modules/apiKeyCollaborator/apiKeyCollaborator.service.js");
type AccessMod = typeof import("./requireApiKeyAccess.js");

let ApiKeyModel: ApiKeyModelType;
let apiKeyCollaboratorService: CollaboratorServiceMod["apiKeyCollaboratorService"];
let requireApiKeyAccess: AccessMod["requireApiKeyAccess"];
let requireApiKeyPermission: AccessMod["requireApiKeyPermission"];
let hasApiKeyPermission: AccessMod["hasApiKeyPermission"];
let loadApiKeyAccess: AccessMod["loadApiKeyAccess"];
let apiKeyIdFromParam: AccessMod["apiKeyIdFromParam"];
let originalFindById: ApiKeyModelType["findById"];
let originalFindByApiKeyAndUser: CollaboratorServiceMod["apiKeyCollaboratorService"]["findByApiKeyAndUser"];

before(async () => {
  const accessMod = await import("./requireApiKeyAccess.js");
  const apiKeyMod = await import("../models/apiKey/apiKey.model.js");
  const collabMod = await import(
    "../modules/apiKeyCollaborator/apiKeyCollaborator.service.js"
  );
  requireApiKeyAccess = accessMod.requireApiKeyAccess;
  requireApiKeyPermission = accessMod.requireApiKeyPermission;
  hasApiKeyPermission = accessMod.hasApiKeyPermission;
  loadApiKeyAccess = accessMod.loadApiKeyAccess;
  apiKeyIdFromParam = accessMod.apiKeyIdFromParam;
  ApiKeyModel = apiKeyMod.ApiKeyModel;
  apiKeyCollaboratorService = collabMod.apiKeyCollaboratorService;
  originalFindById = ApiKeyModel.findById.bind(ApiKeyModel);
  originalFindByApiKeyAndUser =
    apiKeyCollaboratorService.findByApiKeyAndUser.bind(
      apiKeyCollaboratorService,
    );
});

afterEach(() => {
  ApiKeyModel.findById = originalFindById;
  apiKeyCollaboratorService.findByApiKeyAndUser = originalFindByApiKeyAndUser;
});

function stubApiKey(
  doc: { _id: Types.ObjectId; userId: Types.ObjectId; label: string } | null,
): void {
  ApiKeyModel.findById = ((() => ({
    select: () => ({
      lean: async () => doc,
    }),
  })) as unknown) as typeof ApiKeyModel.findById;
}

function fakeRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

async function run(
  mw: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<{
  statusCode: number;
  body: { success?: boolean; message?: string } | null;
  nextCalled: boolean;
}> {
  const res = fakeRes();
  let nextCalled = false;
  await mw(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return {
    statusCode: res.statusCode,
    body: res.body as { success?: boolean; message?: string } | null,
    nextCalled,
  };
}

function authedReq(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Request {
  return {
    user: { _id: userId },
    query: { apiKeyId: apiKeyId.toString() },
    params: {},
  } as unknown as Request;
}

test("permission union is the closed list of collaborator flags", () => {
  assert.deepEqual([...API_KEY_PERMISSION_VALUES], [
    "overview",
    "performance",
    "gaps",
    "train.articleSnippet",
    "train.guidance",
    "test",
    "tools.liveAgent",
    "tools.meeting",
    "tools.mcp",
    "tools.leadCapture",
    "widget",
  ]);
});

test("unauthenticated user gets 401", async () => {
  const apiKeyId = new Types.ObjectId();
  const req = {
    query: { apiKeyId: apiKeyId.toString() },
    params: {},
  } as unknown as Request;
  const result = await run(requireApiKeyAccess(), req);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 401);
  assert.equal(result.body?.message, "Authentication required");
});

test("nonexistent API key is 404", async () => {
  stubApiKey(null);
  const result = await run(
    requireApiKeyAccess(),
    authedReq(new Types.ObjectId(), new Types.ObjectId()),
  );
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 404);
  assert.equal(result.body?.message, "API key not found");
});

test("owner has access without an ApiKeyCollaborator record", async () => {
  const ownerId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });
  apiKeyCollaboratorService.findByApiKeyAndUser = async () => {
    throw new Error("owner must not look up collaborator");
  };

  const req = authedReq(ownerId, apiKeyId);
  const result = await run(requireApiKeyAccess(), req);

  assert.equal(result.nextCalled, true);
  assert.equal(req.apiKeyAccess?.role, "owner");
  assert.equal(req.apiKeyAccess?.permissions.overview, true);
  assert.equal(req.apiKeyAccess?.apiKey.id, apiKeyId.toString());
});

test("owner bypasses individual permission checks", async () => {
  const ownerId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });

  const req = authedReq(ownerId, apiKeyId);
  const result = await run(requireApiKeyPermission("widget"), req);
  assert.equal(result.nextCalled, true);

  const access = await loadApiKeyAccess(ownerId, apiKeyId);
  assert.equal(hasApiKeyPermission(access, "train.articleSnippet"), true);
  assert.equal(hasApiKeyPermission(access, "tools.mcp"), true);
});

test("collaborator with enabled permission has access", async () => {
  const ownerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  const permissions = defaultCollaboratorPermissions();
  permissions.overview = true;
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });
  apiKeyCollaboratorService.findByApiKeyAndUser = async () => ({
    id: new Types.ObjectId().toString(),
    apiKeyId: apiKeyId.toString(),
    userId: userId.toString(),
    permissions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const result = await run(
    requireApiKeyPermission("overview"),
    authedReq(userId, apiKeyId),
  );
  assert.equal(result.nextCalled, true);
});

test("collaborator with disabled permission gets 403", async () => {
  const ownerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });
  apiKeyCollaboratorService.findByApiKeyAndUser = async () => ({
    id: new Types.ObjectId().toString(),
    apiKeyId: apiKeyId.toString(),
    userId: userId.toString(),
    permissions: defaultCollaboratorPermissions(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const result = await run(
    requireApiKeyPermission("widget"),
    authedReq(userId, apiKeyId),
  );
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(
    result.body?.message,
    "You do not have permission to perform this action",
  );
});

test("unrelated authenticated user gets 403", async () => {
  const ownerId = new Types.ObjectId();
  const strangerId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });
  apiKeyCollaboratorService.findByApiKeyAndUser = async () => null;

  const result = await run(
    requireApiKeyAccess(),
    authedReq(strangerId, apiKeyId),
  );
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body?.message, "You do not have access to this API key");
});

test("collaborator of API Key A cannot access API Key B", async () => {
  const ownerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const keyA = new Types.ObjectId();
  const keyB = new Types.ObjectId();
  stubApiKey({ _id: keyB, userId: ownerId, label: "B" });
  apiKeyCollaboratorService.findByApiKeyAndUser = async (_apiKeyId, _userId) => {
    if (_apiKeyId.toString() === keyA.toString()) {
      return {
        id: new Types.ObjectId().toString(),
        apiKeyId: keyA.toString(),
        userId: userId.toString(),
        permissions: defaultCollaboratorPermissions(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  };

  const result = await run(requireApiKeyAccess(), authedReq(userId, keyB));
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});

test("default resolver uses params.apiKeyId, not params.id", async () => {
  const ownerId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  const resourceId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });

  const req = {
    user: { _id: ownerId },
    query: {},
    params: { id: resourceId.toString(), apiKeyId: apiKeyId.toString() },
  } as unknown as Request;
  const result = await run(requireApiKeyAccess(), req);
  assert.equal(result.nextCalled, true);
  assert.equal(req.apiKeyAccess?.apiKey.id, apiKeyId.toString());
});

test("default resolver ignores params.id when apiKeyId is missing", async () => {
  const ownerId = new Types.ObjectId();
  const resourceId = new Types.ObjectId();
  stubApiKey({ _id: resourceId, userId: ownerId, label: "Acme" });

  const req = {
    user: { _id: ownerId },
    query: {},
    params: { id: resourceId.toString() },
  } as unknown as Request;
  const result = await run(requireApiKeyAccess(), req);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
});

test("apiKeyIdFromParam resolves /api-keys/:id style routes", async () => {
  const ownerId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  stubApiKey({ _id: apiKeyId, userId: ownerId, label: "Acme" });

  const req = {
    user: { _id: ownerId },
    query: {},
    params: { id: apiKeyId.toString() },
  } as unknown as Request;
  const result = await run(requireApiKeyAccess(apiKeyIdFromParam("id")), req);
  assert.equal(result.nextCalled, true);
  assert.equal(req.apiKeyAccess?.apiKey.id, apiKeyId.toString());
});

test("changing apiKeyId on the request cannot reuse access from another key", async () => {
  const ownerId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const keyA = new Types.ObjectId();
  const keyB = new Types.ObjectId();
  const permissions = defaultCollaboratorPermissions();
  permissions.overview = true;

  ApiKeyModel.findById = ((id: unknown) => ({
    select: () => ({
      lean: async () => {
        const value = String(id);
        if (value === keyA.toString()) {
          return { _id: keyA, userId: ownerId, label: "A" };
        }
        if (value === keyB.toString()) {
          return { _id: keyB, userId: ownerId, label: "B" };
        }
        return null;
      },
    }),
  })) as unknown as typeof ApiKeyModel.findById;

  apiKeyCollaboratorService.findByApiKeyAndUser = async (apiKeyId) => {
    if (apiKeyId.toString() !== keyA.toString()) return null;
    return {
      id: new Types.ObjectId().toString(),
      apiKeyId: keyA.toString(),
      userId: userId.toString(),
      permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const req = authedReq(userId, keyA);
  const first = await run(requireApiKeyAccess(), req);
  assert.equal(first.nextCalled, true);
  assert.equal(req.apiKeyAccess?.apiKey.id, keyA.toString());

  req.query = { apiKeyId: keyB.toString() };
  const second = await run(requireApiKeyAccess(), req);
  assert.equal(second.nextCalled, false);
  assert.equal(second.statusCode, 403);
});

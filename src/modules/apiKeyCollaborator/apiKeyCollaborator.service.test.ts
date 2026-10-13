import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { Types } from "mongoose";
import { defaultCollaboratorPermissions } from "../../models/apiKeyCollaborator/apiKeyCollaborator.interface.js";

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
  typeof import("../../models/apiKey/apiKey.model.js").ApiKeyModel;
type CollabModelType =
  typeof import("../../models/apiKeyCollaborator/apiKeyCollaborator.model.js").ApiKeyCollaboratorModel;
type UserModelType = typeof import("../../models/user/user.model.js").UserModel;
type ApiKeyServiceMod = typeof import("../apiKey/apiKey.service.js");
type CollabServiceMod =
  typeof import("./apiKeyCollaborator.service.js");

let ApiKeyModel: ApiKeyModelType;
let ApiKeyCollaboratorModel: CollabModelType;
let UserModel: UserModelType;
let apiKeyService: ApiKeyServiceMod["apiKeyService"];
let apiKeyCollaboratorService: CollabServiceMod["apiKeyCollaboratorService"];
let originalApiKeyFind: ApiKeyModelType["find"];
let originalApiKeyFindById: ApiKeyModelType["findById"];
let originalCollabFind: CollabModelType["find"];
let originalUserFind: UserModelType["find"];
let originalFindOneAndUpdate: CollabModelType["findOneAndUpdate"];

before(async () => {
  const apiKeyMod = await import("../../models/apiKey/apiKey.model.js");
  const collabModelMod = await import(
    "../../models/apiKeyCollaborator/apiKeyCollaborator.model.js"
  );
  const userMod = await import("../../models/user/user.model.js");
  const serviceMod = await import("../apiKey/apiKey.service.js");
  const collabServiceMod = await import("./apiKeyCollaborator.service.js");
  ApiKeyModel = apiKeyMod.ApiKeyModel;
  ApiKeyCollaboratorModel = collabModelMod.ApiKeyCollaboratorModel;
  UserModel = userMod.UserModel;
  apiKeyService = serviceMod.apiKeyService;
  apiKeyCollaboratorService = collabServiceMod.apiKeyCollaboratorService;
  originalApiKeyFind = ApiKeyModel.find.bind(ApiKeyModel);
  originalApiKeyFindById = ApiKeyModel.findById.bind(ApiKeyModel);
  originalCollabFind = ApiKeyCollaboratorModel.find.bind(
    ApiKeyCollaboratorModel,
  );
  originalUserFind = UserModel.find.bind(UserModel);
  originalFindOneAndUpdate = ApiKeyCollaboratorModel.findOneAndUpdate.bind(
    ApiKeyCollaboratorModel,
  );
});

afterEach(() => {
  ApiKeyModel.find = originalApiKeyFind;
  ApiKeyModel.findById = originalApiKeyFindById;
  ApiKeyCollaboratorModel.find = originalCollabFind;
  UserModel.find = originalUserFind;
  ApiKeyCollaboratorModel.findOneAndUpdate = originalFindOneAndUpdate;
});

test("listForUser includes owned and shared API keys", async () => {
  const ownerId = new Types.ObjectId();
  const memberId = new Types.ObjectId();
  const ownedKey = {
    _id: new Types.ObjectId(),
    userId: ownerId,
    label: "Mine",
    description: "",
    prefix: "sapai_sk_aaaa",
    ipAllowlist: [],
    lastUsedAt: null,
    status: { status: "active" as const, appliedAt: new Date() },
  };
  const sharedKey = {
    _id: new Types.ObjectId(),
    userId: ownerId,
    label: "Shared",
    description: "",
    prefix: "sapai_sk_bbbb",
    ipAllowlist: [],
    lastUsedAt: null,
    status: { status: "active" as const, appliedAt: new Date() },
  };

  ApiKeyCollaboratorModel.find = ((() => ({
    select: () => ({
      lean: async () => [{ apiKeyId: sharedKey._id }],
    }),
  })) as unknown) as typeof ApiKeyCollaboratorModel.find;

  let findCalls = 0;
  ApiKeyModel.find = ((filter: { userId?: Types.ObjectId; _id?: { $in: Types.ObjectId[] } }) => ({
    sort: () => ({
      lean: async () => {
        findCalls += 1;
        if (filter.userId) return [ownedKey];
        return [sharedKey];
      },
    }),
  })) as unknown as typeof ApiKeyModel.find;

  const result = await apiKeyService.listForUser(memberId);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.role, "owner");
  assert.equal(result[0]?.label, "Mine");
  assert.equal(result[1]?.role, "collaborator");
  assert.equal(result[1]?.label, "Shared");
  assert.equal(findCalls, 2);
});

test("listByApiKey includes collaborator email", async () => {
  const apiKeyId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const now = new Date();
  ApiKeyCollaboratorModel.find = ((() => ({
    sort: () => ({
      lean: async () => [
        {
          _id: new Types.ObjectId(),
          apiKeyId,
          userId,
          permissions: defaultCollaboratorPermissions(),
          createdAt: now,
          updatedAt: now,
        },
      ],
    }),
  })) as unknown) as typeof ApiKeyCollaboratorModel.find;

  UserModel.find = ((() => ({
    select: () => ({
      lean: async () => [{ _id: userId, email: "member@example.com" }],
    }),
  })) as unknown) as typeof UserModel.find;

  const result = await apiKeyCollaboratorService.listByApiKey(apiKeyId);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.email, "member@example.com");
  assert.equal(result[0]?.userId, userId.toString());
});

test("updatePermissions writes the nested flags", async () => {
  const apiKeyId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const permissions = defaultCollaboratorPermissions();
  permissions.overview = true;
  const now = new Date();

  ApiKeyCollaboratorModel.findOneAndUpdate = ((() => ({
    lean: async () => ({
      _id: new Types.ObjectId(),
      apiKeyId,
      userId,
      permissions,
      createdAt: now,
      updatedAt: now,
    }),
  })) as unknown) as typeof ApiKeyCollaboratorModel.findOneAndUpdate;

  const result = await apiKeyCollaboratorService.updatePermissions(
    apiKeyId,
    userId,
    permissions,
  );
  assert.equal(result.permissions.overview, true);
  assert.equal(result.permissions.widget, false);
});

import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { Types } from "mongoose";

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


type GuidanceModelType =
  typeof import("../../models/guidance/guidance.model.js").GuidanceModel;
type GuidanceServiceMod = typeof import("./guidance.service.js");
type UserServiceMod = typeof import("../user/user.service.js");

let GuidanceModel: GuidanceModelType;
let guidanceService: GuidanceServiceMod["guidanceService"];
let userService: UserServiceMod["userService"];
let originalFind: GuidanceModelType["find"];
let originalEmailsByIds: UserServiceMod["userService"]["emailsByIds"];

before(async () => {
  ({ GuidanceModel } = await import("../../models/guidance/guidance.model.js"));
  ({ guidanceService } = await import("./guidance.service.js"));
  ({ userService } = await import("../user/user.service.js"));
  originalFind = GuidanceModel.find;
  originalEmailsByIds = userService.emailsByIds.bind(userService);
});

afterEach(() => {
  GuidanceModel.find = originalFind;
  userService.emailsByIds = originalEmailsByIds;
});

test("list returns owner guidances for a collaborator actor", async () => {
  const ownerId = new Types.ObjectId();
  const collaboratorId = new Types.ObjectId();
  const apiKeyId = new Types.ObjectId();
  const now = new Date();
  const owned = {
    _id: new Types.ObjectId(),
    userId: ownerId,
    apiKeyId,
    title: "Owner guidance",
    content: "",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  let filter: Record<string, unknown> | undefined;
  GuidanceModel.find = ((query: Record<string, unknown>) => {
    filter = query;
    return {
      sort: () => ({
        lean: async () => [owned],
      }),
    };
  }) as unknown as typeof GuidanceModel.find;

  userService.emailsByIds = (async () => new Map()) as typeof userService.emailsByIds;

  const result = await guidanceService.list(collaboratorId, apiKeyId);
  assert.deepEqual(filter, { apiKeyId });
  assert.equal("userId" in (filter ?? {}), false);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Owner guidance");
  assert.equal(result[0]?.apiKeyId, apiKeyId.toString());
});

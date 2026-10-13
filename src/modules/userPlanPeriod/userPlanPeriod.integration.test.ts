/**
 * Integration tests against MongoMemoryReplSet (transactions required).
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose, { Types } from "mongoose";

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


let mongod: { getUri: () => string; stop: () => Promise<boolean> } | null =
  null;
let skipSuite = false;

async function seedPlans() {
  const { PlanModel } = await import("../../models/plan/plan.model.js");
  await PlanModel.deleteMany({});
  const [planA, planB] = await PlanModel.create([
    {
      slug: `int-a-${Date.now()}`,
      name: "A",
      description: "a",
      pricePerMonth: 0,
      priceLabel: 0,
      priceNote: "n/a",
      maxApiKeys: 1,
      maxRequestsPerMinute: 60,
      accentColor: "#000000",
      isDefaultPlan: true,
      isActive: true,
      order: 0,
      showOnPricingPage: false,
    },
    {
      slug: `int-b-${Date.now()}`,
      name: "B",
      description: "b",
      pricePerMonth: 10,
      priceLabel: 10,
      priceNote: "n/a",
      maxApiKeys: 5,
      maxRequestsPerMinute: 60,
      accentColor: "#111111",
      isDefaultPlan: false,
      isActive: true,
      order: 1,
      showOnPricingPage: false,
    },
  ]);
  return { planA: planA!, planB: planB! };
}

before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      const { MongoMemoryReplSet } = await import("mongodb-memory-server");
      const repl = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: "wiredTiger" },
      });
      mongod = repl;
      await mongoose.connect(repl.getUri());
    }
  } catch (err) {
    skipSuite = true;
    console.warn(
      "Skipping integration suite:",
      err instanceof Error ? err.message : String(err),
    );
  }
});

after(async () => {
  if (mongod) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongod.stop();
  }
});
test("stale cache + adjacent B: resolveUserPlan at T+1s returns B", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { resolveUserPlan } = await import("./resolveUserPlan.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA, planB } = await seedPlans();

  const T = new Date(Date.now() - 1000);
  const aStart = new Date(T.getTime() - 30 * 24 * 60 * 60 * 1000);
  const bUntil = new Date(T.getTime() + 30 * 24 * 60 * 60 * 1000);

  const user = await UserModel.create({
    email: `boundary-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planId: planA._id,
    // Stale: still points at A ending at T, even though now is past T
    planPeriodUntil: T,
    planVersion: 0,
  });

  await UserPlanPeriodModel.create([
    {
      userId: user._id,
      planId: planA._id,
      effectiveDate: aStart,
      untilDate: T,
      source: "manual",
    },
    {
      userId: user._id,
      planId: planB._id,
      effectiveDate: T,
      untilDate: bUntil,
      source: "manual",
    },
  ]);

  const plan = await resolveUserPlan(user._id as Types.ObjectId);
  assert.ok(plan);
  assert.equal(plan!._id.toString(), planB._id.toString());
});

test("fillGapsForUser with B present: zero inserts, cache flips to B", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA, planB } = await seedPlans();

  const T = new Date(Date.now() - 2000);
  const aStart = new Date(T.getTime() - 30 * 24 * 60 * 60 * 1000);
  const bUntil = new Date(T.getTime() + 30 * 24 * 60 * 60 * 1000);

  const user = await UserModel.create({
    email: `promote-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planId: planA._id,
    planPeriodUntil: T,
    planVersion: 0,
  });

  await UserPlanPeriodModel.create([
    {
      userId: user._id,
      planId: planA._id,
      effectiveDate: aStart,
      untilDate: T,
      source: "manual",
    },
    {
      userId: user._id,
      planId: planB._id,
      effectiveDate: T,
      untilDate: bUntil,
      source: "manual",
    },
  ]);

  const beforeCount = await UserPlanPeriodModel.countDocuments({
    userId: user._id,
  });
  const result = await userPlanPeriodService.fillGapsForUser(
    user._id as Types.ObjectId,
  );
  assert.equal(result.inserted, 0);
  assert.equal(result.planChanged, true);

  const afterCount = await UserPlanPeriodModel.countDocuments({
    userId: user._id,
  });
  assert.equal(afterCount, beforeCount);

  const refreshed = await UserModel.findById(user._id)
    .select("planId planPeriodUntil")
    .lean<{ planId?: Types.ObjectId; planPeriodUntil?: Date }>();
  assert.equal(refreshed?.planId?.toString(), planB._id.toString());
  assert.equal(refreshed?.planPeriodUntil?.getTime(), bUntil.getTime());
});

test("preserveRemainder truncates active and keeps remainder after new period", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");
  const { PLAN_NEVER_UNTIL } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.interface.js"
  );

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA, planB } = await seedPlans();

  const now = new Date();
  const aStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const aUntil = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const bStart = new Date(now.getTime() + 60_000);
  const bUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const user = await UserModel.create({
    email: `remainder-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planId: planA._id,
    planPeriodUntil: aUntil,
    planVersion: 0,
  });

  await UserPlanPeriodModel.create({
    userId: user._id,
    planId: planA._id,
    effectiveDate: aStart,
    untilDate: aUntil,
    source: "manual",
  });

  const preview = await userPlanPeriodService.previewPeriods(
    user._id as Types.ObjectId,
    {
      periods: [
        {
          planId: planB._id.toString(),
          effectiveDate: bStart.toISOString(),
          untilDate: bUntil.toISOString(),
        },
      ],
      preserveRemainder: true,
    },
  );
  assert.equal(preview.wouldTruncate, true);
  assert.ok(preview.remainder);
  assert.equal(preview.remainder!.planId, planA._id.toString());

  const result = await userPlanPeriodService.addPeriods(
    user._id as Types.ObjectId,
    {
      periods: [
        {
          planId: planB._id.toString(),
          effectiveDate: bStart.toISOString(),
          untilDate: bUntil.toISOString(),
        },
      ],
      preserveRemainder: true,
    },
    null,
  );
  assert.equal(result.remainderCreated, true);
  assert.ok(result.truncatedPeriodId);

  const manuals = await UserPlanPeriodModel.find({
    userId: user._id,
    source: "manual",
  })
    .sort({ effectiveDate: 1 })
    .lean();

  // truncated A, B, remainder A   possibly plus default_sync gaps elsewhere
  const planIds = manuals.map((p) => p.planId.toString());
  assert.ok(planIds.includes(planB._id.toString()));
  const remainder = manuals.find(
    (p) =>
      p.planId.toString() === planA._id.toString() &&
      p.effectiveDate.getTime() === bUntil.getTime(),
  );
  assert.ok(remainder);
  assert.equal(remainder!.untilDate.getTime(), aUntil.getTime());
  void PLAN_NEVER_UNTIL;
});

test("worker key mismatch pass re-syncs without crashing", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { ApiKeyModel } = await import("../../models/apiKey/apiKey.model.js");
  const { runPlanPeriodSyncNow } = await import("./planPeriodGap.worker.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  await ApiKeyModel.deleteMany({});
  const { planA } = await seedPlans();

  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const user = await UserModel.create({
    email: `keysync-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planId: planA._id,
    planPeriodUntil: until,
    planVersion: 0,
  });

  await UserPlanPeriodModel.create({
    userId: user._id,
    planId: planA._id,
    effectiveDate: new Date(Date.now() - 1000),
    untilDate: until,
    source: "manual",
  });

  const appliedAt = new Date();
  await ApiKeyModel.create([
    {
      userId: user._id,
      label: "k1",
      description: "key one",
      prefix: "sap_k1",
      hashedKey: "hash1",
      status: { status: "active", appliedAt },
    },
    {
      userId: user._id,
      label: "k2",
      description: "key two",
      prefix: "sap_k2",
      hashedKey: "hash2",
      status: { status: "active", appliedAt },
    },
  ]);

  const result = await runPlanPeriodSyncNow();
  assert.equal(result.skipped, false);
  assert.ok(result.keysResynced >= 1);

  const keys = await ApiKeyModel.find({ userId: user._id })
    .sort({ _id: 1 })
    .select("status.status")
    .lean<Array<{ status: { status: string } }>>();
  assert.equal(keys[0]!.status.status, "active");
  assert.equal(keys[1]!.status.status, "disabled_plan");
});

test("two concurrent overlapping inserts: one succeeds, other 409", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");
  const { PlanPeriodConflictError } = await import(
    "./planPeriodConflict.error.js"
  );

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA, planB } = await seedPlans();

  const user = await UserModel.create({
    email: `conc-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planVersion: 0,
  });

  const start = new Date(Date.now() + 60_000);
  const mid = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000);

  const results = await Promise.allSettled([
    userPlanPeriodService.addPeriods(
      user._id as Types.ObjectId,
      {
        periods: [
          {
            planId: planA._id.toString(),
            effectiveDate: start.toISOString(),
            untilDate: end.toISOString(),
          },
        ],
        preserveRemainder: false,
      },
      null,
    ),
    userPlanPeriodService.addPeriods(
      user._id as Types.ObjectId,
      {
        periods: [
          {
            planId: planB._id.toString(),
            effectiveDate: mid.toISOString(),
            untilDate: end.toISOString(),
          },
        ],
        preserveRemainder: false,
      },
      null,
    ),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const reason = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(
    reason instanceof PlanPeriodConflictError ||
      (reason instanceof Error &&
        reason.message.toLowerCase().includes("overlap")),
  );

  const manuals = await UserPlanPeriodModel.find({
    userId: user._id,
    source: "manual",
  }).lean();
  assert.equal(manuals.length, 1);
  const winnerPlan = manuals[0]!.planId.toString();
  assert.ok(
    winnerPlan === planA._id.toString() || winnerPlan === planB._id.toString(),
  );
});

test("A1: effectiveMode=now forever replaces active forever and becomes current", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { PLAN_NEVER_UNTIL } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.interface.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");
  const { resolveUserPlan } = await import("./resolveUserPlan.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA, planB } = await seedPlans();

  const user = await UserModel.create({
    email: `now-forever-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planId: planA._id,
    planPeriodUntil: PLAN_NEVER_UNTIL,
    planVersion: 0,
  });

  await UserPlanPeriodModel.create({
    userId: user._id,
    planId: planA._id,
    effectiveDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    untilDate: PLAN_NEVER_UNTIL,
    source: "manual",
    deepseekQuotaPerPeriod: 500,
    deepseekTokenAdjustments: [
      {
        requestedAmount: 100,
        appliedAmount: 100,
        reason: "prior top-up",
        source: "invoice",
        createdAt: new Date(),
      },
    ],
  });

  const result = await userPlanPeriodService.addPeriods(
    user._id as Types.ObjectId,
    {
      periods: [
        {
          planId: planB._id.toString(),
          untilDate: PLAN_NEVER_UNTIL.toISOString(),
          effectiveMode: "now",
        },
      ],
      preserveRemainder: false,
    },
    null,
  );

  assert.equal(result.truncatedPeriodHadTokenAdjustments, true);
  assert.ok(result.truncatedPeriodId);

  const current = await userPlanPeriodService.findPeriodContainingNow(
    user._id as Types.ObjectId,
  );
  assert.ok(current);
  assert.equal(current!.planId.toString(), planB._id.toString());

  const resolved = await resolveUserPlan(user._id as Types.ObjectId);
  assert.equal(resolved?._id.toString(), planB._id.toString());

  const refreshed = await UserModel.findById(user._id)
    .select("planId")
    .lean<{ planId?: Types.ObjectId }>();
  assert.equal(refreshed?.planId?.toString(), planB._id.toString());
});

test("A10: effectiveMode=now with no periods creates current", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");
  const { addCalendarMonths } = await import("../../utils/calendarMonth.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planB } = await seedPlans();

  const user = await UserModel.create({
    email: `empty-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planVersion: 0,
  });

  const before = new Date();
  await userPlanPeriodService.addPeriods(
    user._id as Types.ObjectId,
    {
      periods: [
        {
          planId: planB._id.toString(),
          untilDate: addCalendarMonths(before, 1).toISOString(),
          effectiveMode: "now",
        },
      ],
    },
    null,
  );

  const current = await userPlanPeriodService.findPeriodContainingNow(
    user._id as Types.ObjectId,
  );
  assert.ok(current);
  assert.equal(current!.planId.toString(), planB._id.toString());
});

test("A15: cannot remove current or past period", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }

  const { UserModel } = await import("../../models/user/user.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { userPlanPeriodService } = await import("./userPlanPeriod.service.js");

  await UserPlanPeriodModel.deleteMany({});
  await UserModel.deleteMany({});
  const { planA } = await seedPlans();

  const user = await UserModel.create({
    email: `rm-${Date.now()}@example.com`,
    hashedPassword: "x",
    isAdmin: false,
    planVersion: 0,
  });

  const doc = await UserPlanPeriodModel.create({
    userId: user._id,
    planId: planA._id,
    effectiveDate: new Date(Date.now() - 1000),
    untilDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    source: "manual",
  });

  await assert.rejects(
    () =>
      userPlanPeriodService.removePeriod(
        user._id as Types.ObjectId,
        doc._id as Types.ObjectId,
      ),
    /Only future plan periods can be removed/,
  );
});

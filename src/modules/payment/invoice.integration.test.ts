/**
 * Invoice + Midtrans webhook integration tests (MongoMemoryReplSet).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
process.env.INVOICE_TTL_MINUTES = "15";

let mongod: { getUri: () => string; stop: () => Promise<boolean> } | null =
  null;
let skipSuite = false;

function sign(orderId: string, statusCode: string, grossAmount: string): string {
  const key = process.env.MIDTRANS_SERVER_KEY!;
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${key}`)
    .digest("hex");
}

async function ensureDefaultPlan() {
  const { PlanModel } = await import("../../models/plan/plan.model.js");
  const existing = await PlanModel.findOne({ isDefaultPlan: true });
  if (existing) return existing;
  const [plan] = await PlanModel.create([
    {
      slug: `pay-default-${Date.now()}`,
      name: "Default",
      description: "default",
      pricePerMonth: 0,
      priceLabel: 0,
      priceNote: "free",
      maxApiKeys: 1,
      maxRequestsPerMinute: 60,
      accentColor: "#000000",
      isDefaultPlan: true,
      isActive: true,
      order: 0,
      showOnPricingPage: false,
    },
  ]);
  return plan!;
}

async function seedPlan(pricePerMonth: number, slugSuffix: string) {
  const { PlanModel } = await import("../../models/plan/plan.model.js");
  await ensureDefaultPlan();
  const [plan] = await PlanModel.create([
    {
      slug: `pay-${slugSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Plan ${slugSuffix}`,
      description: "test",
      pricePerMonth,
      priceLabel: pricePerMonth,
      priceNote: "monthly",
      maxApiKeys: 3,
      maxRequestsPerMinute: 60,
      accentColor: "#000000",
      isDefaultPlan: false,
      isActive: true,
      order: 1,
      showOnPricingPage: true,
    },
  ]);
  return plan!;
}

async function seedUser(email: string) {
  const { UserModel } = await import("../../models/user/user.model.js");
  return UserModel.create({
    email,
    hashedPassword: "x",
    isAdmin: false,
    isBlocked: false,
  });
}

function mockSnapOk() {
  return async () =>
    new Response(
      JSON.stringify({
        token: `snap-token-${Math.random().toString(36).slice(2)}`,
        redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/x",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

function mockSnapFail() {
  return async () =>
    new Response(JSON.stringify({ error_messages: ["fail"] }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
      "Skipping invoice integration suite:",
      err instanceof Error ? err.message : String(err),
    );
  }
});

after(async () => {
  const { midtransService } = await import("./midtrans.service.js");
  midtransService.resetFetch();
  if (mongod) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongod.stop();
  }
});

test("concurrent upgrades produce exactly one pending invoice", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`conc-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "conc");
  midtransService.setFetch(mockSnapOk());

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      invoiceService.createOrReuse(user._id, plan._id.toString()),
    ),
  );

  const ids = new Set(results.map((r) => r.id));
  assert.equal(ids.size, 1);
  const pending = await InvoiceModel.countDocuments({
    userId: user._id,
    status: "pending",
  });
  assert.equal(pending, 1);
});

test("same plan reuses invoice; different plan cancels and creates new", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`reuse-${Date.now()}@test.com`);
  const planA = await seedPlan(100000, "a");
  const planB = await seedPlan(200000, "b");
  midtransService.setFetch(mockSnapOk());

  const first = await invoiceService.createOrReuse(user._id, planA._id.toString());
  const second = await invoiceService.createOrReuse(
    user._id,
    planA._id.toString(),
  );
  assert.equal(first.id, second.id);

  const third = await invoiceService.createOrReuse(
    user._id,
    planB._id.toString(),
  );
  assert.notEqual(third.id, first.id);
  assert.equal(third.planId, planB._id.toString());

  const cancelled = await InvoiceModel.findById(first.id);
  assert.equal(cancelled?.status, "cancelled");
  assert.ok(cancelled?.purgeAt);
});

test("Midtrans API failure leaves no permanently pending invoice", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`fail-${Date.now()}@test.com`);
  const plan = await seedPlan(99000, "fail");
  midtransService.setFetch(mockSnapFail());

  await assert.rejects(
    () => invoiceService.createOrReuse(user._id, plan._id.toString()),
    /Payment provider failed/,
  );

  const pending = await InvoiceModel.countDocuments({
    userId: user._id,
    status: "pending",
  });
  assert.equal(pending, 0);
  const failed = await InvoiceModel.countDocuments({
    userId: user._id,
    status: "failed",
  });
  assert.equal(failed, 1);
});

test("webhook: invalid signature rejected; amount mismatch not activated", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`sig-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "sig");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  const bad = await invoiceService.handleNotification({
    order_id: inv.id,
    status_code: "200",
    gross_amount: "149000.00",
    signature_key: "deadbeef",
    transaction_status: "settlement",
  });
  assert.equal(bad.status, 403);

  const mismatch = await invoiceService.handleNotification({
    order_id: inv.id,
    status_code: "200",
    gross_amount: "1.00",
    signature_key: sign(inv.id, "200", "1.00"),
    transaction_status: "settlement",
  });
  assert.equal(mismatch.status, 200);
  const after = await InvoiceModel.findById(inv.id);
  assert.equal(after?.status, "pending");
  assert.equal(after?.needsManualReview, true);
  assert.equal(after?.activatedAt, null);
  const periods = await UserPlanPeriodModel.countDocuments({ userId: user._id });
  assert.equal(periods, 0);
});

test("webhook: duplicate settlement activates once; pending after settlement does not downgrade", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`dup-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "dup");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  const payload = {
    order_id: inv.id,
    status_code: "200",
    gross_amount: "149000.00",
    signature_key: sign(inv.id, "200", "149000.00"),
    transaction_status: "settlement",
    payment_type: "bank_transfer",
    transaction_id: "tx-1",
  };

  await invoiceService.handleNotification(payload);
  await invoiceService.handleNotification(payload);

  const doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "paid");
  assert.ok(doc?.activatedAt && doc.activatedAt.getTime() > 0);

  const pendingAfter = await invoiceService.handleNotification({
    ...payload,
    transaction_status: "pending",
    status_code: "201",
    signature_key: sign(inv.id, "201", "149000.00"),
  });
  assert.equal(pendingAfter.status, 200);
  const still = await InvoiceModel.findById(inv.id);
  assert.equal(still?.status, "paid");

  const manuals = await UserPlanPeriodModel.find({
    userId: user._id,
    source: "manual",
  });
  assert.equal(manuals.length, 1);
});

test("webhook: late payment on expired invoice still activates", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`late-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "late");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  await InvoiceModel.updateOne(
    { _id: inv.id },
    {
      $set: {
        status: "expired",
        expiresAt: new Date(Date.now() - 60_000),
        purgeAt: new Date(Date.now() + 86400000),
      },
    },
  );

  await invoiceService.handleNotification({
    order_id: inv.id,
    status_code: "200",
    gross_amount: "149000.00",
    signature_key: sign(inv.id, "200", "149000.00"),
    transaction_status: "settlement",
  });

  const doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "paid");
  assert.ok(doc?.activatedAt && doc.activatedAt.getTime() > 0);
  const periods = await UserPlanPeriodModel.countDocuments({
    userId: user._id,
    source: "manual",
  });
  assert.equal(periods, 1);
});

test("stacking: not subscribed, active with time left, expired plan", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { addCalendarMonths } = await import("../../utils/calendarMonth.js");

  const userBare = await seedUser(`stack-bare-${Date.now()}@test.com`);
  await UserPlanPeriodModel.deleteMany({ userId: userBare._id });
  const bare = await invoiceService.computePaidPeriod(userBare._id);
  const now = Date.now();
  assert.ok(Math.abs(bare.effectiveDate.getTime() - now) < 5000);
  assert.equal(
    bare.untilDate.getTime(),
    addCalendarMonths(bare.effectiveDate, 1).getTime(),
  );

  const userActive = await seedUser(`stack-act-${Date.now()}@test.com`);
  const plan = await seedPlan(1000, "stack");
  const until = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  await UserPlanPeriodModel.create({
    userId: userActive._id,
    planId: plan._id,
    effectiveDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    untilDate: until,
    source: "manual",
  });
  const stacked = await invoiceService.computePaidPeriod(userActive._id);
  assert.equal(stacked.effectiveDate.getTime(), until.getTime());
  assert.equal(
    stacked.untilDate.getTime(),
    addCalendarMonths(until, 1).getTime(),
  );

  const userExpired = await seedUser(`stack-exp-${Date.now()}@test.com`);
  await UserPlanPeriodModel.create({
    userId: userExpired._id,
    planId: plan._id,
    effectiveDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    untilDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    source: "manual",
  });
  const expired = await invoiceService.computePaidPeriod(userExpired._id);
  assert.ok(Math.abs(expired.effectiveDate.getTime() - Date.now()) < 5000);
});

test("reject non-purchasable plans", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");
  midtransService.setFetch(mockSnapOk());

  const user = await seedUser(`free-${Date.now()}@test.com`);
  const free = await seedPlan(0, "free");
  await assert.rejects(
    () => invoiceService.createOrReuse(user._id, free._id.toString()),
    /not purchasable/,
  );

  await assert.rejects(
    () => invoiceService.createOrReuse(user._id, new Types.ObjectId().toString()),
    /Plan not found/,
  );
});

function mockSnapThenStatus(statusBody: Record<string, unknown>, statusHttp = 200) {
  let snapCalls = 0;
  let statusCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/snap/v1/transactions") && !url.includes("/cancel")) {
      snapCalls += 1;
      return new Response(
        JSON.stringify({
          token: `snap-token-${snapCalls}`,
          redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/x",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/v2/") && url.includes("/status")) {
      statusCalls += 1;
      return new Response(JSON.stringify(statusBody), {
        status: statusHttp,
        headers: { "Content-Type": "application/json" },
      });
    }
    void init;
    return new Response("{}", { status: 404 });
  };
  return {
    fetchImpl,
    counts: () => ({ snapCalls, statusCalls }),
  };
}

test("poll finds settled transaction and activates once", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`poll-ok-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "pollok");

  const mock = mockSnapThenStatus({
    order_id: "PLACEHOLDER",
    status_code: "200",
    gross_amount: "149000.00",
    transaction_status: "settlement",
    payment_type: "bank_transfer",
    transaction_id: "tx-poll-1",
  });
  midtransService.setFetch(async (input, init) => {
    const url = String(input);
    if (url.includes("/status")) {
      const orderId = url.split("/v2/")[1]?.split("/status")[0] ?? "";
      return new Response(
        JSON.stringify({
          order_id: decodeURIComponent(orderId),
          status_code: "200",
          gross_amount: "149000.00",
          transaction_status: "settlement",
          payment_type: "bank_transfer",
          transaction_id: "tx-poll-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return mock.fetchImpl(input, init);
  });

  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);

  const doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "paid");
  assert.ok(doc?.activatedAt && doc.activatedAt.getTime() > 0);
  const manuals = await UserPlanPeriodModel.countDocuments({
    userId: user._id,
    source: "manual",
  });
  assert.equal(manuals, 1);
});

test("webhook and poll concurrently activate once", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`race-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "race");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  midtransService.setFetch(async (input) => {
    const url = String(input);
    if (url.includes("/status")) {
      return new Response(
        JSON.stringify({
          order_id: inv.id,
          status_code: "200",
          gross_amount: "149000.00",
          transaction_status: "settlement",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 404 });
  });

  const webhookPayload = {
    order_id: inv.id,
    status_code: "200",
    gross_amount: "149000.00",
    signature_key: sign(inv.id, "200", "149000.00"),
    transaction_status: "settlement",
  };

  await Promise.all([
    invoiceService.handleNotification(webhookPayload),
    invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0),
  ]);

  const manuals = await UserPlanPeriodModel.countDocuments({
    userId: user._id,
    source: "manual",
  });
  assert.equal(manuals, 1);
  const doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "paid");
});

test("poll 404 keeps pending; 5xx leaves unchanged", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`p404-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "p404");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  midtransService.setFetch(async () => new Response("{}", { status: 404 }));
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);
  let doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "pending");
  assert.ok((doc?.pollCount ?? 0) >= 1);

  await InvoiceModel.updateOne(
    { _id: inv.id },
    { $set: { lastPolledAt: new Date(0) } },
  );
  midtransService.setFetch(async () => new Response("{}", { status: 503 }));
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);
  doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "pending");
  assert.equal(doc?.needsManualReview, false);
});

test("poll amount mismatch flagged; poll never downgrades paid", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`pmis-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "pmis");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  midtransService.setFetch(async () =>
    new Response(
      JSON.stringify({
        order_id: inv.id,
        status_code: "200",
        gross_amount: "1.00",
        transaction_status: "settlement",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);
  let doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "pending");
  assert.equal(doc?.needsManualReview, true);

  await InvoiceModel.updateOne(
    { _id: inv.id },
    {
      $set: {
        status: "paid",
        paidAt: new Date(),
        activatedAt: new Date(),
        needsManualReview: false,
        lastPolledAt: new Date(0),
      },
    },
  );
  midtransService.setFetch(async () =>
    new Response(
      JSON.stringify({
        order_id: inv.id,
        status_code: "201",
        gross_amount: "149000.00",
        transaction_status: "pending",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  // claim requires pending   apply directly
  const paidDoc = await InvoiceModel.findById(inv.id);
  assert.ok(paidDoc);
  await invoiceService.applyMidtransStatus(
    paidDoc,
    {
      order_id: inv.id,
      status_code: "201",
      gross_amount: "149000.00",
      transaction_status: "pending",
    },
    "poll",
  );
  doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "paid");
});

test("after expiresAt final poll expires; late settlement in grace activates", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`grace-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "grace");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());

  await InvoiceModel.updateOne(
    { _id: inv.id },
    {
      $set: {
        expiresAt: new Date(Date.now() - 60_000),
        lastPolledAt: new Date(0),
      },
    },
  );

  midtransService.setFetch(async () => new Response("{}", { status: 404 }));
  await invoiceService.pollInvoiceFromMidtrans(new Types.ObjectId(inv.id), 0);
  let doc = await InvoiceModel.findById(inv.id);
  assert.equal(doc?.status, "expired");

  // late settlement path via apply (expired + settlement)
  midtransService.setFetch(mockSnapOk());
  const inv2 = await invoiceService.createOrReuse(user._id, plan._id.toString());
  await InvoiceModel.updateOne(
    { _id: inv2.id },
    {
      $set: {
        status: "expired",
        expiresAt: new Date(Date.now() - 60_000),
        purgeAt: new Date(Date.now() + 86400000),
        lastPolledAt: new Date(0),
      },
    },
  );
  const expiredDoc = await InvoiceModel.findById(inv2.id);
  assert.ok(expiredDoc);
  await invoiceService.applyMidtransStatus(
    expiredDoc,
    {
      order_id: inv2.id,
      status_code: "200",
      gross_amount: "149000.00",
      transaction_status: "settlement",
    },
    "poll",
  );
  doc = await InvoiceModel.findById(inv2.id);
  assert.equal(doc?.status, "paid");
  assert.ok(doc?.activatedAt && doc.activatedAt.getTime() > 0);
});

test("two pollers do not both claim within throttle; on-demand throttle skips Midtrans", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`claim-${Date.now()}@test.com`);
  const plan = await seedPlan(149000, "claim");
  midtransService.setFetch(mockSnapOk());
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());
  const id = new Types.ObjectId(inv.id);

  const first = await invoiceService.claimForPoll(id, 60_000);
  const second = await invoiceService.claimForPoll(id, 60_000);
  assert.ok(first);
  assert.equal(second, null);

  let statusCalls = 0;
  midtransService.setFetch(async (input) => {
    const url = String(input);
    if (url.includes("/status")) {
      statusCalls += 1;
      return new Response("{}", { status: 404 });
    }
    return mockSnapOk()();
  });

  await InvoiceModel.updateOne(
    { _id: id },
    { $set: { lastPolledAt: new Date(), status: "pending" } },
  );
  // within throttle   getInvoiceStatusForUser should not call Midtrans
  await invoiceService.getInvoiceStatusForUser(user._id);
  assert.equal(statusCalls, 0);

  await InvoiceModel.updateOne(
    { _id: id },
    { $set: { lastPolledAt: new Date(0) } },
  );
  await invoiceService.getInvoiceStatusForUser(user._id);
  assert.ok(statusCalls >= 1);
});

test("createOrReuse sets expiresAt to ~15 minutes", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`ttl-${Date.now()}@test.com`);
  const plan = await seedPlan(120000, "ttl");
  midtransService.setFetch(mockSnapOk());

  const before = Date.now();
  const inv = await invoiceService.createOrReuse(user._id, plan._id.toString());
  const after = Date.now();
  const expiresMs = new Date(inv.expiresAt).getTime();
  const expectedMin = before + 15 * 60_000 - 5_000;
  const expectedMax = after + 15 * 60_000 + 5_000;
  assert.ok(expiresMs >= expectedMin && expiresMs <= expectedMax);

  const doc = await InvoiceModel.findById(inv.id);
  assert.ok(doc);
  assert.ok(
    Math.abs(doc.expiresAt.getTime() - doc.createdAt!.getTime() - 15 * 60_000) <
      5_000,
  );
});

test("exportPdfForUser: unpaid includes payment-page QR URL; paid has no QR", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const {
    buildInvoicePaymentPageUrl,
    invoiceService,
  } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");

  await InvoiceModel.deleteMany({});
  const user = await seedUser(`pdf-${Date.now()}@test.com`);
  const plan = await seedPlan(130000, "pdf");
  midtransService.setFetch(mockSnapOk());

  const pending = await invoiceService.createOrReuse(
    user._id,
    plan._id.toString(),
  );
  const unpaid = await invoiceService.exportPdfForUser(user._id, pending.id);
  assert.ok(unpaid.buffer.subarray(0, 4).toString("ascii") === "%PDF");
  const expectedUrl = buildInvoicePaymentPageUrl(pending.id);
  assert.equal(
    unpaid.paymentPageUrl,
    `${process.env.FRONTEND_URL!.replace(/\/$/, "")}/payment/${pending.id}`,
  );
  assert.equal(unpaid.paymentPageUrl, expectedUrl);

  await InvoiceModel.updateOne(
    { _id: pending.id },
    {
      $set: {
        status: "paid",
        paidAt: new Date(),
        activatedAt: new Date(),
      },
    },
  );
  const paid = await invoiceService.exportPdfForUser(user._id, pending.id);
  assert.ok(paid.buffer.subarray(0, 4).toString("ascii") === "%PDF");
  assert.equal(paid.paymentPageUrl, null);
});

test("getForUser and exportPdfForUser deny cross-user access as Invoice not found", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { midtransService } = await import("./midtrans.service.js");
  const { statusForMessage } = await import("../../validation/http.js");

  await InvoiceModel.deleteMany({});
  const owner = await seedUser(`owner-${Date.now()}@test.com`);
  const other = await seedUser(`other-${Date.now()}@test.com`);
  const plan = await seedPlan(140000, "acl");
  midtransService.setFetch(mockSnapOk());

  const inv = await invoiceService.createOrReuse(
    owner._id,
    plan._id.toString(),
  );

  await assert.rejects(
    () => invoiceService.getForUser(other._id, inv.id),
    (err: unknown) =>
      err instanceof Error && err.message === "Invoice not found",
  );
  await assert.rejects(
    () => invoiceService.exportPdfForUser(other._id, inv.id),
    (err: unknown) =>
      err instanceof Error && err.message === "Invoice not found",
  );
  assert.equal(statusForMessage("Invoice not found"), 404);

  const missingId = new Types.ObjectId().toString();
  await assert.rejects(
    () => invoiceService.getForUser(owner._id, missingId),
    (err: unknown) =>
      err instanceof Error && err.message === "Invoice not found",
  );
});

test("B1/B2/B12: token_topup mark paid applies once; create alone does not", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");
  const { userPlanPeriodService } = await import(
    "../userPlanPeriod/userPlanPeriod.service.js"
  );

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`topup-${Date.now()}@test.com`);
  const plan = await seedPlan(0, "topup");
  const admin = await seedUser(`admin-topup-${Date.now()}@test.com`);

  const period = await UserPlanPeriodModel.create({
    userId: user._id,
    planId: plan._id,
    effectiveDate: new Date(Date.now() - 1000),
    untilDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    source: "manual",
    deepseekQuotaPerPeriod: 1000,
  });

  const pending = await invoiceService.createAdminInvoice(
    user._id,
    {
      type: "token_topup",
      targetPeriodId: period._id.toString(),
      deepseekTokens: 500,
      amount: 0,
    },
    admin._id,
  );
  assert.equal(pending.status, "pending");
  assert.equal(pending.type, "token_topup");
  assert.equal(pending.planId, null);
  assert.equal(pending.planName, null);
  let fresh = await UserPlanPeriodModel.findById(period._id).lean();
  assert.equal(fresh!.deepseekQuotaPerPeriod, 1000);
  const pendingDoc = await InvoiceModel.findById(pending.id).lean();
  assert.equal(pendingDoc?.planId ?? null, null);

  const paid = await invoiceService.markPaidManually(
    new Types.ObjectId(pending.id),
    "manual grant",
    admin._id,
  );
  assert.equal(paid.status, "paid");
  assert.ok(paid.effectAppliedAt);
  fresh = await UserPlanPeriodModel.findById(period._id).lean();
  assert.equal(fresh!.deepseekQuotaPerPeriod, 1500);

  await invoiceService.markPaidManually(
    new Types.ObjectId(pending.id),
    "retry",
    admin._id,
  );
  fresh = await UserPlanPeriodModel.findById(period._id).lean();
  assert.equal(fresh!.deepseekQuotaPerPeriod, 1500);

  const quota = await userPlanPeriodService.getCurrentPeriodQuota(user._id);
  assert.equal(quota?.deepseekQuotaPerPeriod, 1500);
});

test("B3: token_topup rejects upcoming target without allowFuturePeriod", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { invoiceService } = await import("./invoice.service.js");

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`future-topup-${Date.now()}@test.com`);
  const plan = await seedPlan(0, "fut");
  const admin = await seedUser(`admin-fut-${Date.now()}@test.com`);

  await UserPlanPeriodModel.create({
    userId: user._id,
    planId: plan._id,
    effectiveDate: new Date(Date.now() - 1000),
    untilDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    source: "manual",
    deepseekQuotaPerPeriod: 100,
  });
  const upcoming = await UserPlanPeriodModel.create({
    userId: user._id,
    planId: plan._id,
    effectiveDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    untilDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
    source: "manual",
    deepseekQuotaPerPeriod: 100,
  });

  await assert.rejects(
    () =>
      invoiceService.createAdminInvoice(
        user._id,
        {
          type: "token_topup",
          targetPeriodId: upcoming._id.toString(),
          deepseekTokens: 50,
          amount: 0,
        },
        admin._id,
      ),
    /allowFuturePeriod/,
  );

  const allowed = await invoiceService.createAdminInvoice(
    user._id,
    {
      type: "token_topup",
      targetPeriodId: upcoming._id.toString(),
      deepseekTokens: 50,
      amount: 0,
      allowFuturePeriod: true,
    },
    admin._id,
  );
  assert.equal(allowed.status, "pending");
});

test("B8: top-up invoice after period replace applies to new current", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server replSet unavailable");
    return;
  }
  const { UserPlanPeriodModel } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.model.js"
  );
  const { InvoiceModel } = await import("../../models/invoice/invoice.model.js");
  const { PLAN_NEVER_UNTIL } = await import(
    "../../models/userPlanPeriod/userPlanPeriod.interface.js"
  );
  const { invoiceService } = await import("./invoice.service.js");
  const { userPlanPeriodService } = await import(
    "../userPlanPeriod/userPlanPeriod.service.js"
  );

  await InvoiceModel.deleteMany({});
  await UserPlanPeriodModel.deleteMany({});
  const user = await seedUser(`retarget-${Date.now()}@test.com`);
  const starter = await seedPlan(10000, "starter");
  const free = await seedPlan(0, "freeish");
  const admin = await seedUser(`admin-rt-${Date.now()}@test.com`);

  const oldPeriod = await UserPlanPeriodModel.create({
    userId: user._id,
    planId: starter._id,
    effectiveDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    untilDate: PLAN_NEVER_UNTIL,
    source: "manual",
    deepseekQuotaPerPeriod: 200,
  });

  const pending = await invoiceService.createAdminInvoice(
    user._id,
    {
      type: "token_topup",
      targetPeriodId: oldPeriod._id.toString(),
      deepseekTokens: 777,
      amount: 0,
    },
    admin._id,
  );

  await userPlanPeriodService.addPeriods(
    user._id,
    {
      periods: [
        {
          planId: free._id.toString(),
          untilDate: PLAN_NEVER_UNTIL.toISOString(),
          effectiveMode: "now",
        },
      ],
    },
    null,
  );

  await invoiceService.markPaidManually(
    new Types.ObjectId(pending.id),
    "paid after replace",
    admin._id,
  );

  const current = await userPlanPeriodService.findPeriodContainingNow(user._id);
  assert.ok(current);
  assert.equal(current!.planId.toString(), free._id.toString());
  assert.equal(current!.deepseekQuotaPerPeriod, 777);

  const ended = await UserPlanPeriodModel.findById(oldPeriod._id).lean();
  assert.equal(ended!.deepseekQuotaPerPeriod, 200);
});

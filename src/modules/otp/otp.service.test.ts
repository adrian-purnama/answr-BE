import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { HttpError } from "../../utils/httpError";

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

before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const server = await MongoMemoryServer.create();
      mongod = server;
      await mongoose.connect(server.getUri());
    }
  } catch (err) {
    skipSuite = true;
    console.warn(
      "Skipping otp.service suite:",
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

test("second OTP send within 60s is blocked with remaining seconds", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { OtpModel } = await import("../../models/otp/otp.model.js");
  const { OtpService } = await import("./otp.service.js");
  await OtpModel.deleteMany({});

  const email = `cooldown-${Date.now()}@example.com`;
  const svc = new OtpService();
  await svc.issueOtp(email, "register");

  await assert.rejects(
    () => new OtpService().issueOtp(email, "register"),
    (err: unknown) =>
      err instanceof HttpError &&
      err.statusCode === 429 &&
      typeof err.retryAfterSeconds === "number" &&
      err.retryAfterSeconds > 0 &&
      err.retryAfterSeconds <= 60,
  );
});

test("6th OTP send within an hour is blocked", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { OtpModel } = await import("../../models/otp/otp.model.js");
  const { OtpService } = await import("./otp.service.js");
  const { otpRateConfig } = await import(
    "../../rateLimit/rateLimit.config.js"
  );
  await OtpModel.deleteMany({});

  const email = `cap-${Date.now()}@example.com`;
  const now = new Date();
  await OtpModel.create({
    email,
    purpose: "register",
    sendCount: otpRateConfig.sendMaxPerWindow,
    sendWindowStart: now,
    lastSentAt: new Date(now.getTime() - otpRateConfig.cooldownMs - 1_000),
    expiresAt: new Date(now.getTime() + otpRateConfig.sendWindowMs),
  });

  await assert.rejects(
    () => new OtpService().issueOtp(email, "register"),
    (err: unknown) => err instanceof HttpError && err.statusCode === 429,
  );
});

test("6th wrong verify invalidates OTP; correct code then fails; send cap survives", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { OtpModel } = await import("../../models/otp/otp.model.js");
  const { OtpService } = await import("./otp.service.js");
  const { otpRateConfig } = await import(
    "../../rateLimit/rateLimit.config.js"
  );
  await OtpModel.deleteMany({});

  const email = `fail-${Date.now()}@example.com`;
  const svc = new OtpService();
  const issued = await svc.issueOtp(email, "register");

  for (let i = 0; i < otpRateConfig.maxFailedAttempts - 1; i++) {
    const ok = await new OtpService().validateAndConsume(
      email,
      "register",
      "000000",
    );
    assert.equal(ok, false);
  }

  await assert.rejects(
    () =>
      new OtpService().validateAndConsume(email, "register", "000000"),
    (err: unknown) =>
      err instanceof HttpError &&
      err.message === otpRateConfig.messages.invalidated,
  );

  const afterInvalidate = await OtpModel.findOne({ email, purpose: "register" });
  assert.ok(afterInvalidate);
  assert.ok(!afterInvalidate!.otp);
  assert.equal(afterInvalidate!.sendCount, 1);

  const okCorrect = await new OtpService().validateAndConsume(
    email,
    "register",
    issued.otp,
  );
  assert.equal(okCorrect, false);

  // Cap still enforced after invalidation: bump sendCount to max with cooldown cleared.
  await OtpModel.updateOne(
    { email, purpose: "register" },
    {
      $set: {
        sendCount: otpRateConfig.sendMaxPerWindow,
        lastSentAt: new Date(Date.now() - otpRateConfig.cooldownMs - 1_000),
      },
    },
  );
  await assert.rejects(
    () => new OtpService().issueOtp(email, "register"),
    (err: unknown) => err instanceof HttpError && err.statusCode === 429,
  );
});

test("successful consume clears code but keeps sendCount for hourly cap", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { OtpModel } = await import("../../models/otp/otp.model.js");
  const { OtpService } = await import("./otp.service.js");
  const { otpRateConfig } = await import(
    "../../rateLimit/rateLimit.config.js"
  );
  await OtpModel.deleteMany({});

  const email = `consume-${Date.now()}@example.com`;
  const issued = await new OtpService().issueOtp(email, "register");
  const ok = await new OtpService().validateAndConsume(
    email,
    "register",
    issued.otp,
  );
  assert.equal(ok, true);

  const doc = await OtpModel.findOne({ email, purpose: "register" });
  assert.ok(doc);
  assert.ok(!doc!.otp);
  assert.equal(doc!.sendCount, 1);

  await OtpModel.updateOne(
    { email, purpose: "register" },
    {
      $set: {
        sendCount: otpRateConfig.sendMaxPerWindow,
        lastSentAt: new Date(Date.now() - otpRateConfig.cooldownMs - 1_000),
      },
    },
  );
  await assert.rejects(
    () => new OtpService().issueOtp(email, "register"),
    (err: unknown) => err instanceof HttpError && err.statusCode === 429,
  );
});

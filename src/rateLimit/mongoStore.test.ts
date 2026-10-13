import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";

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
      "Skipping mongoStore suite:",
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

test("MongoStore allows up to max and rolls window", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { RateLimitCounterModel } = await import(
    "../models/rateLimit/rateLimitCounter.model.js"
  );
  const { MongoStore } = await import("./mongoStore.js");
  await RateLimitCounterModel.deleteMany({});

  let nowMs = Date.now();
  const store = new MongoStore({ now: () => nowMs });
  const key = `test:${Date.now()}`;
  const windowMs = 5_000;

  for (let i = 1; i <= 3; i++) {
    const r = await store.increment(key, windowMs);
    assert.equal(r.count, i);
  }
  const over = await store.increment(key, windowMs);
  assert.equal(over.count, 4);

  nowMs += windowMs + 1;
  const rolled = await store.increment(key, windowMs);
  assert.equal(rolled.count, 1);
});

test("MongoStore concurrent increments are atomic", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { RateLimitCounterModel } = await import(
    "../models/rateLimit/rateLimitCounter.model.js"
  );
  const { MongoStore } = await import("./mongoStore.js");
  await RateLimitCounterModel.deleteMany({});

  const store = new MongoStore();
  const key = `concurrent:${Date.now()}`;
  const results = await Promise.all(
    Array.from({ length: 40 }, () => store.increment(key, 60_000)),
  );
  const counts = results.map((r) => r.count).sort((a, b) => a - b);
  assert.equal(counts[counts.length - 1], 40);
  assert.equal(new Set(counts).size, 40);
});

test("MongoStore reset clears the key", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { RateLimitCounterModel } = await import(
    "../models/rateLimit/rateLimitCounter.model.js"
  );
  const { MongoStore } = await import("./mongoStore.js");
  await RateLimitCounterModel.deleteMany({});

  const store = new MongoStore();
  const key = `reset:${Date.now()}`;
  await store.increment(key, 60_000);
  await store.reset(key);
  assert.equal(await store.get(key), null);
});

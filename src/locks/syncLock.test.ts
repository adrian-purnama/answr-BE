import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { SyncLockConflictError } from "./syncLock";

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
      "Skipping syncLock suite:",
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

test("concurrent second acquire fails; release allows next; stale lock expires", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { SyncLockModel } = await import(
    "../models/syncLock/syncLock.model.js"
  );
  const {
    acquireSyncLockOrThrow,
    releaseSyncLock,
    tryAcquireSyncLock,
    withSyncLock,
  } = await import("./syncLock.js");

  await SyncLockModel.deleteMany({});
  const key = `lock:${Date.now()}`;

  await acquireSyncLockOrThrow(key, "already running", 60_000);
  await assert.rejects(
    () => acquireSyncLockOrThrow(key, "already running", 60_000),
    (err: unknown) => err instanceof SyncLockConflictError,
  );

  await releaseSyncLock(key);
  assert.equal(await tryAcquireSyncLock(key, 60_000), true);
  await releaseSyncLock(key);

  await SyncLockModel.create({
    key: `${key}:stale`,
    expiresAt: new Date(Date.now() - 1_000),
  });
  assert.equal(await tryAcquireSyncLock(`${key}:stale`, 60_000), true);
  await releaseSyncLock(`${key}:stale`);

  let sawRefresh = false;
  await withSyncLock(
    `${key}:with`,
    async (refresh) => {
      await refresh();
      sawRefresh = true;
      return 1;
    },
    { ttlMs: 30_000, refreshEveryMs: 60_000 },
  );
  assert.equal(sawRefresh, true);
  assert.equal(await SyncLockModel.exists({ key: `${key}:with` }), null);
});

test("concurrent batch-test lock returns 409 conflict", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { SyncLockModel } = await import(
    "../models/syncLock/syncLock.model.js"
  );
  const { acquireSyncLockOrThrow, releaseSyncLock } = await import(
    "./syncLock.js"
  );
  await SyncLockModel.deleteMany({});
  const key = `batch-test-run:${new mongoose.Types.ObjectId().toString()}`;
  await acquireSyncLockOrThrow(key, "Batch test group is already running");
  await assert.rejects(
    () =>
      acquireSyncLockOrThrow(key, "Batch test group is already running"),
    (err: unknown) =>
      err instanceof SyncLockConflictError &&
      err.statusCode === 409 &&
      err.message === "Batch test group is already running",
  );
  await releaseSyncLock(key);
});

test("withSyncLock releases after error", async (t) => {
  if (skipSuite) {
    t.skip("mongodb-memory-server unavailable");
    return;
  }
  const { SyncLockModel } = await import(
    "../models/syncLock/syncLock.model.js"
  );
  const { withSyncLock, tryAcquireSyncLock, releaseSyncLock } = await import(
    "./syncLock.js"
  );
  await SyncLockModel.deleteMany({});
  const key = `lock-err:${Date.now()}`;

  await assert.rejects(
    () =>
      withSyncLock(key, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );
  assert.equal(await tryAcquireSyncLock(key, 60_000), true);
  await releaseSyncLock(key);
});

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import cors from "cors";
import express, { type Express } from "express";
import mongoose from "mongoose";
import { AddressInfo } from "node:net";
import {
  assertLoginEmailNotLocked,
  recordLoginEmailFailure,
  resetLoginEmailFailures,
} from "./loginEmailFailures";
import { globalRateLimit, rateLimit } from "./rateLimit.middleware";
import { getMemoryStore } from "./stores";
import { HttpError } from "../utils/httpError";
import { rateLimitConfig } from "./rateLimit.config";

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
process.env.TRUST_PROXY ??= "1";

let mongod: { getUri: () => string; stop: () => Promise<boolean> } | null =
  null;
let skipMongo = false;
let server: http.Server | null = null;
let baseUrl = "";

function buildTestApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: "https://app.example.com" }));
  app.use(globalRateLimit());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ success: true, message: "ok", data: null });
  });
  app.post("/payment/midtrans/notification", (_req, res) => {
    res.json({ success: true, message: "ok", data: null });
  });
  app.post("/auth/login", rateLimit("loginIp"), (_req, res) => {
    res.json({ success: true, message: "ok", data: null });
  });
  app.post(
    "/auth/reset-password",
    rateLimit("resetPasswordIp"),
    (_req, res) => {
      res.json({ success: true, message: "ok", data: null });
    },
  );
  app.post(
    "/payment/invoices",
    (req, _res, next) => {
      const id =
        typeof req.headers["x-test-user"] === "string"
          ? req.headers["x-test-user"]
          : "user-a";
      // Minimal stand-in for req.user._id used by keyBy:"user".
      (req as { user?: { _id: { toString(): string } } }).user = {
        _id: { toString: () => id },
      };
      next();
    },
    rateLimit("invoicePurchaseUser"),
    rateLimit("invoicePurchaseIp"),
    (_req, res) => {
      res.json({ success: true, message: "ok", data: null });
    },
  );

  return app;
}

before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const mem = await MongoMemoryServer.create();
      mongod = mem;
      await mongoose.connect(mem.getUri());
    }
  } catch (err) {
    skipMongo = true;
    console.warn(
      "Skipping rateLimit http mongo parts:",
      err instanceof Error ? err.message : String(err),
    );
  }

  server = buildTestApp().listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  if (mongod) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongod.stop();
  }
  getMemoryStore().stop();
});

async function request(
  path: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

test("429 responses include CORS headers", async () => {
  // Exhaust loginIp quickly using a unique IP via X-Forwarded-For (trust proxy 1).
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const max = rateLimitConfig.loginIp.max;
  let last: Response | null = null;
  for (let i = 0; i < max + 1; i++) {
    last = await request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.example.com",
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify({ email: "a@example.com", password: "x" }),
    });
  }
  assert.ok(last);
  assert.equal(last!.status, 429);
  assert.ok(last!.headers.get("access-control-allow-origin"));
  assert.equal(
    last!.headers.get("access-control-allow-origin"),
    "https://app.example.com",
  );
  assert.ok(last!.headers.get("retry-after"));
  const body = (await last!.json()) as {
    success: boolean;
    retryAfterSeconds?: number;
  };
  assert.equal(body.success, false);
  assert.ok(
    typeof body.retryAfterSeconds === "number" && body.retryAfterSeconds > 0,
  );
});

test("health and Midtrans notification are not globally rate limited", async () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  for (let i = 0; i < 20; i++) {
    const health = await request("/health", {
      headers: { "X-Forwarded-For": ip },
    });
    assert.equal(health.status, 200);
    const midtrans = await request("/payment/midtrans/notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
      },
      body: "{}",
    });
    assert.equal(midtrans.status, 200);
  }
});

test("resetPasswordIp limiter returns 429 after max", async (t) => {
  if (skipMongo) {
    t.skip("mongodb unavailable");
    return;
  }
  const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  const max = rateLimitConfig.resetPasswordIp.max;
  let last: Response | null = null;
  for (let i = 0; i < max + 1; i++) {
    last = await request("/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify({
        email: "r@example.com",
        otp: "123456",
        password: "password",
      }),
    });
  }
  assert.equal(last!.status, 429);
});

test("invoice purchase limits per user and per IP", async (t) => {
  if (skipMongo) {
    t.skip("mongodb unavailable");
    return;
  }
  const userMax = rateLimitConfig.invoicePurchaseUser.max;
  const user = `user-${Date.now()}`;
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  let last: Response | null = null;
  for (let i = 0; i < userMax + 1; i++) {
    last = await request("/payment/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "x-test-user": user,
      },
      body: "{}",
    });
  }
  assert.equal(last!.status, 429);

  const ipMax = rateLimitConfig.invoicePurchaseIp.max;
  const sharedIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  last = null;
  for (let i = 0; i < ipMax + 1; i++) {
    last = await request("/payment/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": sharedIp,
        "x-test-user": `u-${i}-${Date.now()}`,
      },
      body: "{}",
    });
  }
  assert.equal(last!.status, 429);
});

test("login email failures block existing and non-existing emails identically", async (t) => {
  if (skipMongo) {
    t.skip("mongodb unavailable");
    return;
  }
  const emailExisting = `exists-${Date.now()}@example.com`;
  const emailMissing = `missing-${Date.now()}@example.com`;
  const max = rateLimitConfig.loginEmailFailures.max;

  for (let i = 0; i < max; i++) {
    await recordLoginEmailFailure(emailExisting);
    await recordLoginEmailFailure(emailMissing);
  }

  let existingErr: unknown;
  let missingErr: unknown;
  try {
    await assertLoginEmailNotLocked(emailExisting);
  } catch (e) {
    existingErr = e;
  }
  try {
    await assertLoginEmailNotLocked(emailMissing);
  } catch (e) {
    missingErr = e;
  }

  assert.ok(existingErr instanceof HttpError);
  assert.ok(missingErr instanceof HttpError);
  assert.equal(
    (existingErr as HttpError).statusCode,
    (missingErr as HttpError).statusCode,
  );
  assert.equal(
    (existingErr as HttpError).message,
    (missingErr as HttpError).message,
  );
  assert.equal((existingErr as HttpError).statusCode, 429);

  await resetLoginEmailFailures(emailExisting);
  await assertLoginEmailNotLocked(emailExisting);
});

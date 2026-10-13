import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

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

test("verifySignature accepts valid SHA512 and rejects invalid", async () => {
  const { midtransService } = await import("./midtrans.service.js");
  const { env } = await import("../../environment/env.js");

  const orderId = "507f1f77bcf86cd799439011";
  const statusCode = "200";
  const grossAmount = "149000.00";
  const signature_key = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.midtransServerKey}`)
    .digest("hex");

  assert.equal(
    midtransService.verifySignature({
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key,
    }),
    true,
  );

  assert.equal(
    midtransService.verifySignature({
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: "0".repeat(128),
    }),
    false,
  );
});

test("getTransactionStatus maps 404/401/5xx/ok", async () => {
  const { midtransService } = await import("./midtrans.service.js");

  midtransService.setFetch(async () => new Response("{}", { status: 404 }));
  assert.equal(
    (await midtransService.getTransactionStatus("order-1")).kind,
    "not_found",
  );

  midtransService.setFetch(async () => new Response("{}", { status: 401 }));
  assert.equal(
    (await midtransService.getTransactionStatus("order-1")).kind,
    "unauthorized",
  );

  midtransService.setFetch(async () => new Response("{}", { status: 503 }));
  assert.equal(
    (await midtransService.getTransactionStatus("order-1")).kind,
    "retryable",
  );

  midtransService.setFetch(async () =>
    new Response(
      JSON.stringify({
        order_id: "order-1",
        status_code: "200",
        gross_amount: "100.00",
        transaction_status: "settlement",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const ok = await midtransService.getTransactionStatus("order-1");
  assert.equal(ok.kind, "ok");
  if (ok.kind === "ok") {
    assert.equal(ok.data.transactionStatus, "settlement");
  }

  midtransService.resetFetch();
});

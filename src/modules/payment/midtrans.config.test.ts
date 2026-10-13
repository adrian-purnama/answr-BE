import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBuild } from "../../environment/parseBuild";
import { getMidtransUrls } from "./midtrans.config";

test("parseBuild requires exact development or production", () => {
  assert.equal(parseBuild("development"), "development");
  assert.equal(parseBuild("production"), "production");
  assert.equal(parseBuild('"development"'), "development");
  assert.throws(() => parseBuild(undefined), /BUILD is required/);
  assert.throws(() => parseBuild(""), /BUILD is required/);
  assert.throws(() => parseBuild("dev"), /must be exactly/);
  assert.throws(() => parseBuild("DEVELOPMENT"), /must be exactly/);
  assert.throws(() => parseBuild("staging"), /must be exactly/);
});

test("getMidtransUrls derives sandbox vs production hosts", () => {
  const sandbox = getMidtransUrls("development");
  assert.equal(sandbox.snapBaseUrl, "https://app.sandbox.midtrans.com");
  assert.equal(sandbox.coreBaseUrl, "https://api.sandbox.midtrans.com");
  assert.equal(
    sandbox.snapJsUrl,
    "https://app.sandbox.midtrans.com/snap/snap.js",
  );

  const prod = getMidtransUrls("production");
  assert.equal(prod.snapBaseUrl, "https://app.midtrans.com");
  assert.equal(prod.coreBaseUrl, "https://api.midtrans.com");
  assert.equal(prod.snapJsUrl, "https://app.midtrans.com/snap/snap.js");
});

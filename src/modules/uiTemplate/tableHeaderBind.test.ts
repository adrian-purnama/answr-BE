import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  headerToKey,
  keyToDisplayHeader,
  leafPropertyKeysForArray,
  normalizeTableHeadersInNode,
  pickLeafKeyForHeader,
  resolveRecordField,
} from "./tableHeaderBind";

describe("tableHeaderBind", () => {
  it("round-trips camelCase keys through display headers", () => {
    for (const key of [
      "pricePerMonth",
      "maxApiKeys",
      "maxRequestsPerMinute",
      "isActive",
      "isDefaultPlan",
    ]) {
      assert.equal(headerToKey(keyToDisplayHeader(key)), key);
    }
  });

  it("resolves messy LLM headers to plan fields", () => {
    const plan = {
      name: "Super Business",
      slug: "super-business",
      pricePerMonth: 299,
      maxApiKeys: 50,
      maxRequestsPerMinute: 1000,
      maxInFlightJobs: 25,
      isActive: true,
      isDefaultPlan: false,
    };

    assert.equal(resolveRecordField(plan, "Name"), "Super Business");
    assert.equal(resolveRecordField(plan, "Slug"), "super-business");
    assert.equal(resolveRecordField(plan, "Price/Month"), 299);
    assert.equal(resolveRecordField(plan, "API Keys"), 50);
    assert.equal(resolveRecordField(plan, "Req/min"), 1000);
    assert.equal(resolveRecordField(plan, "In-flight Jobs"), 25);
    assert.equal(resolveRecordField(plan, "Active"), true);
    assert.equal(resolveRecordField(plan, "Default"), false);
  });

  it("normalizes generated table headers from output paths", () => {
    const paths = [
      "count",
      "plans",
      "plans.name",
      "plans.slug",
      "plans.pricePerMonth",
      "plans.maxApiKeys",
      "plans.isActive",
      "plans.isDefaultPlan",
    ];
    const root = {
      type: "card",
      title: "Plans",
      children: [
        {
          type: "table",
          bindRows: "plans",
          headers: [
            "Name",
            "Slug",
            "Price/Month",
            "API Keys",
            "Active",
            "Default",
          ],
          rows: [["", "", "", "", "", ""]],
        },
      ],
    };

    normalizeTableHeadersInNode(root, paths);
    const table = root.children[0] as {
      headers: string[];
      rows: string[][];
    };

    assert.deepEqual(table.headers, [
      "Name",
      "Slug",
      "Price Per Month",
      "Max Api Keys",
      "Is Active",
      "Is Default Plan",
    ]);
    assert.equal(table.rows[0]?.length, 6);

    for (const header of table.headers) {
      const key = pickLeafKeyForHeader(
        header,
        leafPropertyKeysForArray(paths, "plans"),
        new Set(),
      );
      assert.ok(key, `header ${header} should map to a leaf key`);
    }
  });
});

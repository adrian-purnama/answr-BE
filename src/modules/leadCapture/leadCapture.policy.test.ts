import assert from "node:assert/strict";
import test from "node:test";
import type { LeadFieldConfig } from "../../models/leadCapture/leadCapture.interface";
import {
  askForStrategy,
  decideLeadWrite,
  missingRequiredKeys,
} from "./leadCapture.policy";

const fields: LeadFieldConfig[] = [
  {
    id: "name",
    key: "name",
    label: "Name",
    type: "name",
    required: false,
    order: 0,
  },
  {
    id: "email",
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    order: 1,
  },
  {
    id: "phone",
    key: "phone",
    label: "Phone",
    type: "phone",
    required: false,
    order: 2,
  },
];

test("missing required ignores optional fields", () => {
  assert.deepEqual(missingRequiredKeys(fields, { name: "Ada" }), ["email"]);
  assert.deepEqual(
    missingRequiredKeys(fields, { email: "ada@example.com" }),
    [],
  );
});

test("submit stores optional values and does not block on them", () => {
  const decision = decideLeadWrite({
    action: "submit",
    strategy: "subtle",
    qualification: "lead",
    fields,
    existingValues: {},
    existingStatus: null,
    existingSummary: "",
    incoming: { email: "ada@example.com", phone: "+1 555 0100", unknown: "nope" },
  });
  assert.equal(decision.submitted, true);
  assert.equal(decision.status, "lead");
  assert.deepEqual(decision.missingRequired, []);
  assert.equal(decision.values.email, "ada@example.com");
  assert.equal(decision.values.phone, "+1 555 0100");
  assert.equal("unknown" in decision.values, false);
  assert.equal(decision.fieldValues.some((field) => field.key === "phone"), true);
});

test("missing required fields do not submit", () => {
  const decision = decideLeadWrite({
    action: "submit",
    strategy: "aggressive",
    qualification: "hot",
    fields,
    existingValues: { name: "Ada" },
    existingStatus: null,
    existingSummary: "",
    incoming: {},
  });
  assert.equal(decision.submitted, false);
  assert.equal(decision.status, "gathering");
  assert.deepEqual(decision.missingRequired, ["email"]);
  assert.equal(decision.values.name, "Ada");
});

test("invalid required email does not count as gathered", () => {
  const decision = decideLeadWrite({
    action: "submit",
    strategy: "subtle",
    qualification: "lead",
    fields,
    existingValues: {},
    existingStatus: null,
    existingSummary: "",
    incoming: { email: "not-an-email" },
  });
  assert.equal(decision.submitted, false);
  assert.deepEqual(decision.missingRequired, ["email"]);
});

test("strategy ask modes", () => {
  assert.equal(askForStrategy("aggressive", "lead"), "now");
  assert.equal(askForStrategy("subtle", "hot"), "opportunity");
  assert.equal(askForStrategy("adaptive", "hot"), "now");
  assert.equal(askForStrategy("adaptive", "qualified"), "relevant");
  assert.equal(askForStrategy("adaptive", "lead"), "opportunity");
});

test("submit ask follows strategy when required fields are missing", () => {
  const base = {
    action: "submit" as const,
    qualification: "qualified" as const,
    fields,
    existingValues: {},
    existingStatus: null,
    existingSummary: "",
    incoming: { name: "Ada" },
  };
  assert.equal(
    decideLeadWrite({ ...base, strategy: "aggressive" }).ask,
    "now",
  );
  assert.equal(
    decideLeadWrite({ ...base, strategy: "subtle" }).ask,
    "opportunity",
  );
  assert.equal(
    decideLeadWrite({ ...base, strategy: "adaptive" }).ask,
    "relevant",
  );
  assert.equal(
    decideLeadWrite({
      ...base,
      strategy: "adaptive",
      qualification: "hot",
    }).ask,
    "now",
  );
});

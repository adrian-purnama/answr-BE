import assert from "node:assert/strict";
import test from "node:test";
import { clockContextPrompt, stripModelLeakTags } from "./agent.prompts";

test("stripModelLeakTags drops thought/channel wrappers", () => {
  const raw = `Halo!\n<thought\n<channel|>Halo!`;
  const cleaned = stripModelLeakTags(raw);
  assert.equal(cleaned.includes("<thought"), false);
  assert.equal(cleaned.includes("<channel"), false);
  assert.ok(cleaned.includes("Halo!"));
});

test("clockContextPrompt uses the given instant", () => {
  const now = new Date("2026-09-21T06:30:00.000Z");
  const prompt = clockContextPrompt(now);
  assert.ok(prompt.includes("2026-09-21T06:30:00.000Z"));
  assert.ok(prompt.includes("UTC calendar date: 2026-09-21"));
  assert.ok(prompt.includes("from=2026-08-22"));
  assert.ok(prompt.includes("to=2026-09-21"));
  assert.equal(prompt.includes("2024-08"), false);
});

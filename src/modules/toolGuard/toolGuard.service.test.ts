import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MemoryToolGuardStore } from "./memoryToolGuardStore";
import { ToolGuardService } from "./toolGuard.service";
import {
  TOOL_GUARD_CLAIM_TTL_MS,
  TOOL_GUARD_IP_MESSAGE_LIMIT,
  TOOL_GUARD_MESSAGE_WINDOW_MS,
  TOOL_GUARD_SESSION_MESSAGE_LIMIT,
} from "./toolGuard.types";

let nowMs = 1_000_000;
const now = () => nowMs;

function store(): MemoryToolGuardStore {
  return new MemoryToolGuardStore({ now, sweepMs: null });
}

afterEach(() => {
  nowMs = 1_000_000;
});

test("allowMessage permits up to session and IP caps inside the window", () => {
  const guard = new ToolGuardService(store());
  for (let i = 0; i < TOOL_GUARD_SESSION_MESSAGE_LIMIT; i++) {
    assert.equal(guard.allowMessage("sess-a", "1.1.1.1"), true);
  }
  assert.equal(guard.allowMessage("sess-a", "1.1.1.1"), false);

  nowMs += TOOL_GUARD_MESSAGE_WINDOW_MS + 1;
  assert.equal(guard.allowMessage("sess-a", "1.1.1.1"), true);
});

test("allowMessage enforces the IP cap across sessions", () => {
  const guard = new ToolGuardService(store());
  for (let i = 0; i < TOOL_GUARD_IP_MESSAGE_LIMIT; i++) {
    assert.equal(guard.allowMessage(`sess-${i}`, "9.9.9.9"), true);
  }
  assert.equal(guard.allowMessage("sess-new", "9.9.9.9"), false);
  assert.equal(guard.allowMessage("sess-other-ip", "8.8.8.8"), true);
});

test("allowMessage with empty IP still applies the session cap", () => {
  const guard = new ToolGuardService(store());
  for (let i = 0; i < TOOL_GUARD_SESSION_MESSAGE_LIMIT; i++) {
    assert.equal(guard.allowMessage("sess-empty-ip", ""), true);
  }
  assert.equal(guard.allowMessage("sess-empty-ip", ""), false);
});

test("allowMessage does not consume quota when denied", () => {
  const guard = new ToolGuardService(store());
  for (let i = 0; i < TOOL_GUARD_SESSION_MESSAGE_LIMIT; i++) {
    assert.equal(guard.allowMessage("sess-b", "2.2.2.2"), true);
  }
  assert.equal(guard.allowMessage("sess-b", "2.2.2.2"), false);
  nowMs += TOOL_GUARD_MESSAGE_WINDOW_MS + 1;
  for (let i = 0; i < TOOL_GUARD_SESSION_MESSAGE_LIMIT; i++) {
    assert.equal(guard.allowMessage("sess-b", "2.2.2.2"), true);
  }
});

test("canEmit live_agent max 1 per session", () => {
  const guard = new ToolGuardService(store());
  assert.equal(guard.canEmit("s1", "live_agent"), true);
  guard.recordEmission("s1", "live_agent");
  nowMs += 15 * 60 * 1000 + 1;
  assert.equal(guard.canEmit("s1", "live_agent"), false);
});

test("canEmit booking_prompt cooldown and max 3", () => {
  const guard = new ToolGuardService(store());
  guard.recordEmission("s1", "booking_prompt");
  assert.equal(guard.canEmit("s1", "booking_prompt"), false);
  nowMs += 2 * 60 * 1000 + 1;
  assert.equal(guard.canEmit("s1", "booking_prompt"), true);
  guard.recordEmission("s1", "booking_prompt");
  nowMs += 2 * 60 * 1000 + 1;
  guard.recordEmission("s1", "booking_prompt");
  nowMs += 2 * 60 * 1000 + 1;
  assert.equal(guard.canEmit("s1", "booking_prompt"), false);
});

test("canEmit resolved cooldown and max 2", () => {
  const guard = new ToolGuardService(store());
  guard.recordEmission("s1", "resolved");
  assert.equal(guard.canEmit("s1", "resolved"), false);
  nowMs += 5 * 60 * 1000 + 1;
  assert.equal(guard.canEmit("s1", "resolved"), true);
  guard.recordEmission("s1", "resolved");
  nowMs += 5 * 60 * 1000 + 1;
  assert.equal(guard.canEmit("s1", "resolved"), false);
});

test("claimWrite allows the first caller only until TTL", () => {
  const guard = new ToolGuardService(store());
  assert.equal(guard.claimWrite("ticket:s1"), true);
  assert.equal(guard.claimWrite("ticket:s1"), false);
  nowMs += TOOL_GUARD_CLAIM_TTL_MS + 1;
  assert.equal(guard.claimWrite("ticket:s1"), true);
});

test("pruneExpired drops old windows and claims", () => {
  const memory = store();
  const guard = new ToolGuardService(memory);
  assert.equal(guard.allowMessage("sess-p", "3.3.3.3"), true);
  assert.equal(guard.claimWrite("old-claim"), true);
  nowMs += TOOL_GUARD_CLAIM_TTL_MS + 1;
  memory.pruneExpired();
  assert.equal(guard.allowMessage("sess-p", "3.3.3.3"), true);
  assert.equal(guard.claimWrite("old-claim"), true);
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MemoryStore } from "./memoryStore";

let nowMs = 1_000_000;
const now = () => nowMs;

afterEach(() => {
  nowMs = 1_000_000;
});

test("MemoryStore allows up to max then reports higher count", async () => {
  const store = new MemoryStore({ now, sweepMs: null });
  const windowMs = 60_000;
  for (let i = 1; i <= 3; i++) {
    const r = await store.increment("k", windowMs);
    assert.equal(r.count, i);
  }
  const over = await store.increment("k", windowMs);
  assert.equal(over.count, 4);
  store.stop();
});

test("MemoryStore resets after the window", async () => {
  const store = new MemoryStore({ now, sweepMs: null });
  const windowMs = 1_000;
  await store.increment("k", windowMs);
  nowMs += windowMs + 1;
  const r = await store.increment("k", windowMs);
  assert.equal(r.count, 1);
  store.stop();
});

test("MemoryStore reset clears the key", async () => {
  const store = new MemoryStore({ now, sweepMs: null });
  await store.increment("k", 60_000);
  await store.reset("k");
  assert.equal(await store.get("k"), null);
  const r = await store.increment("k", 60_000);
  assert.equal(r.count, 1);
  store.stop();
});

test("MemoryStore concurrent increments stay atomic in-process", async () => {
  const store = new MemoryStore({ now, sweepMs: null });
  const results = await Promise.all(
    Array.from({ length: 50 }, () => store.increment("concurrent", 60_000)),
  );
  const counts = results.map((r) => r.count).sort((a, b) => a - b);
  assert.deepEqual(
    counts,
    Array.from({ length: 50 }, (_, i) => i + 1),
  );
  const final = await store.get("concurrent");
  assert.equal(final?.count, 50);
  store.stop();
});

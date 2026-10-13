import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUseDeepseek, usedInWindow } from "./deepseekQuotaHelpers";

describe("usedInWindow / canUseDeepseek", () => {
  it("allows when under quota", () => {
    assert.equal(
      canUseDeepseek({ apiKey: "k", quota: 1000, used: 100 }),
      true,
    );
  });

  it("rejects when used >= quota or quota/key missing", () => {
    assert.equal(
      canUseDeepseek({ apiKey: "k", quota: 1000, used: 1000 }),
      false,
    );
    assert.equal(canUseDeepseek({ apiKey: "k", quota: 0, used: 0 }), false);
    assert.equal(canUseDeepseek({ apiKey: "", quota: 1000, used: 0 }), false);
  });

  it("treats stale windowIndex as zero used (window rollover)", () => {
    assert.equal(
      usedInWindow(
        {
          windowIndex: 0,
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
        },
        1,
      ),
      0,
    );
    assert.equal(
      usedInWindow(
        {
          windowIndex: 1,
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
        },
        1,
      ),
      700,
    );
  });
});

describe("concurrent $inc semantics", () => {
  it("counts both recordings when two $inc apply to the same window", () => {
    const counters = {
      windowIndex: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    const applyInc = (input: number, output: number) => {
      counters.inputTokens += input;
      counters.outputTokens += output;
      counters.totalTokens += input + output;
    };

    applyInc(10, 5);
    applyInc(20, 7);

    assert.equal(counters.inputTokens, 30);
    assert.equal(counters.outputTokens, 12);
    assert.equal(counters.totalTokens, 42);
    assert.equal(usedInWindow(counters, 0), 42);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import {
  parseLiveAgentHandoffArgs,
  shouldAllowLiveAgentHandoff,
  type LiveAgentHandoffArgs,
} from "./liveAgentHandoff";
import { collectDeclaredTools, isCallLiveAgentTool } from "./agent.tools";
import { CALL_LIVE_AGENT_TOOL_NAME } from "./agent.prompts";

function args(
  partial: Partial<LiveAgentHandoffArgs> = {},
): LiveAgentHandoffArgs {
  return {
    frustration: "none",
    helpAttempts: 0,
    humanRequests: 0,
    noRelevantInfo: false,
    reason: "test",
    ...partial,
  };
}

test("shouldAllowLiveAgentHandoff low: always allows valid args", () => {
  assert.equal(
    shouldAllowLiveAgentHandoff("low", args({ frustration: "none" })),
    true,
  );
});

test("shouldAllowLiveAgentHandoff medium: few attempts, repeated ask, or no info", () => {
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "medium",
      args({ frustration: "none", humanRequests: 1, helpAttempts: 1 }),
    ),
    false,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "medium",
      args({ frustration: "none", humanRequests: 2 }),
    ),
    true,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "medium",
      args({ frustration: "none", helpAttempts: 2 }),
    ),
    true,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "medium",
      args({ frustration: "none", noRelevantInfo: true }),
    ),
    true,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "medium",
      args({ frustration: "mild", humanRequests: 0 }),
    ),
    true,
  );
});

test("shouldAllowLiveAgentHandoff high: calm second ask alone is denied", () => {
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "high",
      args({ frustration: "none", humanRequests: 2, helpAttempts: 1 }),
    ),
    false,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "high",
      args({ frustration: "mild", humanRequests: 2, helpAttempts: 2 }),
    ),
    false,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "high",
      args({
        frustration: "clear",
        humanRequests: 2,
        helpAttempts: 2,
      }),
    ),
    true,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "high",
      args({
        frustration: "clear",
        humanRequests: 2,
        noRelevantInfo: true,
      }),
    ),
    true,
  );
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "high",
      args({
        frustration: "clear",
        humanRequests: 1,
        helpAttempts: 5,
        noRelevantInfo: true,
      }),
    ),
    false,
  );
});

test("shouldAllowLiveAgentHandoff never: always false", () => {
  assert.equal(
    shouldAllowLiveAgentHandoff(
      "never",
      args({
        frustration: "clear",
        helpAttempts: 10,
        humanRequests: 10,
        noRelevantInfo: true,
      }),
    ),
    false,
  );
});

test("parseLiveAgentHandoffArgs validates required fields", () => {
  assert.equal(parseLiveAgentHandoffArgs(undefined), null);
  assert.deepEqual(
    parseLiveAgentHandoffArgs({
      frustration: "clear",
      helpAttempts: 2,
      humanRequests: 2,
      noRelevantInfo: true,
      reason: "Cursing and missing knowledge",
    }),
    {
      frustration: "clear",
      helpAttempts: 2,
      humanRequests: 2,
      noRelevantInfo: true,
      reason: "Cursing and missing knowledge",
    },
  );
  assert.equal(
    parseLiveAgentHandoffArgs({
      frustration: "clear",
      helpAttempts: 2,
      humanRequests: 2,
      reason: "missing noRelevantInfo",
    }),
    null,
  );
});

test("collectDeclaredTools omits call_live_agent when resilience is never", async () => {
  const apiKeyId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const neverTools = await collectDeclaredTools({
    apiKeyId,
    userId,
    guidanceContents: [],
    liveAgentEnabled: true,
    liveAgentResilience: "never",
  });
  assert.equal(
    neverTools.some((tool) => isCallLiveAgentTool(tool.name)),
    false,
  );

  const highTools = await collectDeclaredTools({
    apiKeyId,
    userId,
    guidanceContents: [],
    liveAgentEnabled: true,
    liveAgentResilience: "high",
  });
  assert.equal(
    highTools.some((tool) => tool.name === CALL_LIVE_AGENT_TOOL_NAME),
    true,
  );
});

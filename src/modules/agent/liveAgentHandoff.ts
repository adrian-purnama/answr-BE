import type { LiveAgentResilience } from "../../dto/liveAgent.dto";
import { logger } from "../../logger/logger";

const logSource = "modules/agent/liveAgentHandoff.ts";

export const LIVE_AGENT_HANDOFF_DENY_INSTRUCTION =
  "Handoff not justified yet under the current setting. Keep helping: acknowledge the request and ask a clarifying question about the issue. Do not mention settings or rules.";

export const LIVE_AGENT_HANDOFF_DEFER_MESSAGE =
  "Happy to help — let me try to resolve this for you first. What specifically are you stuck on?";

export const LIVE_AGENT_NEVER_FALLBACK_MESSAGE =
  "A live agent isn't available here, but I'm happy to keep helping. What do you need?";

export type LiveAgentFrustrationLevel = "none" | "mild" | "clear";

export type LiveAgentHandoffArgs = {
  frustration: LiveAgentFrustrationLevel;
  helpAttempts: number;
  humanRequests: number;
  /** True when knowledge/guidance cannot answer the visitor's issue. */
  noRelevantInfo: boolean;
  reason: string;
};

export const CALL_LIVE_AGENT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    frustration: {
      type: "string",
      enum: ["none", "mild", "clear"],
      description:
        "Visitor frustration: none, mild, or clear (anger, cursing, giving up, strong complaints).",
    },
    helpAttempts: {
      type: "number",
      description:
        "How many times you have already tried to solve the visitor's issue this conversation.",
    },
    humanRequests: {
      type: "number",
      description:
        "How many times the visitor has asked for a human or live agent this conversation.",
    },
    noRelevantInfo: {
      type: "boolean",
      description:
        "True if your knowledge and guidance cannot answer their issue (missing info / out of scope).",
    },
    reason: {
      type: "string",
      description:
        "One sentence explaining why handoff is justified under the current live-agent instructions.",
    },
  },
  required: [
    "frustration",
    "helpAttempts",
    "humanRequests",
    "noRelevantInfo",
    "reason",
  ],
} as const;

function isFrustrationLevel(value: unknown): value is LiveAgentFrustrationLevel {
  return value === "none" || value === "mild" || value === "clear";
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** Parse tool call args; null if missing or invalid. */
export function parseLiveAgentHandoffArgs(
  raw: Record<string, unknown> | undefined,
): LiveAgentHandoffArgs | null {
  if (!raw) return null;
  if (!isFrustrationLevel(raw.frustration)) return null;
  const helpAttempts = toNonNegativeInt(raw.helpAttempts);
  const humanRequests = toNonNegativeInt(raw.humanRequests);
  const noRelevantInfo = toBoolean(raw.noRelevantInfo);
  if (
    helpAttempts === null ||
    humanRequests === null ||
    noRelevantInfo === null
  ) {
    return null;
  }
  if (typeof raw.reason !== "string" || !raw.reason.trim()) return null;
  return {
    frustration: raw.frustration,
    helpAttempts,
    humanRequests,
    noRelevantInfo,
    reason: raw.reason.trim(),
  };
}

/**
 * Light sanity check aligned with product intent:
 * - low: easy handoff
 * - medium: a few attempts / repeated ask / missing info / any frustration
 * - high: clear frustration AND (missing info OR real help attempts) AND repeated human ask
 * - never: always deny
 */
export function shouldAllowLiveAgentHandoff(
  resilience: LiveAgentResilience,
  args: LiveAgentHandoffArgs,
): boolean {
  if (resilience === "never") return false;
  if (resilience === "low") return true;

  if (resilience === "medium") {
    if (
      args.noRelevantInfo ||
      args.humanRequests >= 2 ||
      args.helpAttempts >= 2 ||
      args.frustration === "mild" ||
      args.frustration === "clear"
    ) {
      return true;
    }
    return false;
  }

  // high: calm second ask alone is not enough
  return (
    args.frustration === "clear" &&
    args.humanRequests >= 2 &&
    (args.noRelevantInfo || args.helpAttempts >= 2)
  );
}

export function logLiveAgentHandoffDecision(params: {
  resilience: LiveAgentResilience;
  args: LiveAgentHandoffArgs | null;
  allowed: boolean;
  reason: "never" | "invalid_args" | "sanity_deny" | "allowed";
}): void {
  logger.info(
    JSON.stringify({
      event: "live_agent_handoff_decision",
      resilience: params.resilience,
      args: params.args,
      allowed: params.allowed,
      reason: params.reason,
    }),
    logSource,
    "logLiveAgentHandoffDecision",
  );
}

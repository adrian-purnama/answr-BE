export type ToolGuardIntent = "live_agent" | "booking_prompt" | "resolved";

export type ToolGuardClock = () => number;

export interface ToolGuardIntentRule {
  cooldownMs: number;
  maxPerSession: number;
}

export const TOOL_GUARD_INTENT_RULES: Record<
  ToolGuardIntent,
  ToolGuardIntentRule
> = {
  live_agent: { cooldownMs: 15 * 60 * 1000, maxPerSession: 1 },
  booking_prompt: { cooldownMs: 2 * 60 * 1000, maxPerSession: 3 },
  resolved: { cooldownMs: 5 * 60 * 1000, maxPerSession: 2 },
};

export const TOOL_GUARD_MESSAGE_WINDOW_MS = 60_000;
export const TOOL_GUARD_SESSION_MESSAGE_LIMIT = 20;
export const TOOL_GUARD_IP_MESSAGE_LIMIT = 60;
export const TOOL_GUARD_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export interface ToolGuardStore {
  allowMessage(sessionId: string, ip: string): boolean;
  canEmit(sessionId: string, intent: ToolGuardIntent): boolean;
  recordEmission(sessionId: string, intent: ToolGuardIntent): void;
  claimWrite(idempotencyKey: string): boolean;
}

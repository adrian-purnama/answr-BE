import type { RateLimitConfigEntry, RateLimitName } from "./rateLimit.types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** OTP send/verify rules (tracked on the OTP document, not the limiter store). */
export const otpRateConfig = {
  cooldownMs: 60_000,
  cooldownSeconds: 60,
  sendMaxPerWindow: 5,
  sendWindowMs: HOUR,
  codeTtlMs: 5 * MINUTE,
  maxFailedAttempts: 5,
  messages: {
    cooldown: "Please wait before requesting another OTP",
    sendCap: "Too many OTP requests for this email. Try again later",
    invalidated:
      "Too many incorrect OTP attempts. Request a new code and try again",
    invalid: "Invalid or expired OTP",
  },
} as const;

export const rateLimitConfig: Record<RateLimitName, RateLimitConfigEntry> = {
  globalIp: {
    name: "globalIp",
    store: "memory",
    windowMs: MINUTE,
    max: 300,
    keyBy: "ip",
    message: "Too many requests. Please try again later",
  },
  loginIp: {
    name: "loginIp",
    store: "mongo",
    windowMs: 15 * MINUTE,
    max: 20,
    keyBy: "ip",
    message: "Too many login attempts. Please try again later",
  },
  loginEmailFailures: {
    name: "loginEmailFailures",
    store: "mongo",
    windowMs: 15 * MINUTE,
    max: 5,
    keyBy: "ip+identifier",
    identifierField: "email",
    message: "Too many login attempts. Please try again later",
  },
  registerIp: {
    name: "registerIp",
    store: "mongo",
    windowMs: HOUR,
    max: 10,
    keyBy: "ip",
    message: "Too many registration attempts. Please try again later",
  },
  resetPasswordIp: {
    name: "resetPasswordIp",
    store: "mongo",
    windowMs: HOUR,
    max: 5,
    keyBy: "ip",
    message: "Too many password reset attempts. Please try again later",
  },
  otpSendIp: {
    name: "otpSendIp",
    store: "mongo",
    windowMs: HOUR,
    max: 20,
    keyBy: "ip",
    message: "Too many OTP requests. Please try again later",
  },
  articleSyncUser: {
    name: "articleSyncUser",
    store: "mongo",
    windowMs: HOUR,
    max: 3,
    keyBy: "user",
    message: "Too many article sync requests. Please try again later",
  },
  articleResyncOneUser: {
    name: "articleResyncOneUser",
    store: "mongo",
    windowMs: HOUR,
    max: 20,
    keyBy: "user",
    message: "Too many article resync requests. Please try again later",
  },
  invoicePurchaseUser: {
    name: "invoicePurchaseUser",
    store: "mongo",
    windowMs: 10 * MINUTE,
    max: 5,
    keyBy: "user",
    message: "Too many purchase attempts. Please try again later",
  },
  invoicePurchaseIp: {
    name: "invoicePurchaseIp",
    store: "mongo",
    windowMs: 10 * MINUTE,
    max: 10,
    keyBy: "ip",
    message: "Too many purchase attempts. Please try again later",
  },
  llmChatUser: {
    name: "llmChatUser",
    store: "memory",
    windowMs: MINUTE,
    max: 20,
    keyBy: "user",
    message: "Too many chat requests. Please try again later",
  },
  llmChatIp: {
    name: "llmChatIp",
    store: "memory",
    windowMs: MINUTE,
    max: 60,
    keyBy: "ip",
    message: "Too many chat requests. Please try again later",
  },
  batchTestRunUser: {
    name: "batchTestRunUser",
    store: "mongo",
    windowMs: 10 * MINUTE,
    max: 5,
    keyBy: "user",
    message: "Too many batch test runs. Please try again later",
  },
};

export const GLOBAL_RATE_LIMIT_SKIP_PATHS = new Set([
  "/health",
  "/payment/midtrans/notification",
]);

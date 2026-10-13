export type RateLimitStoreKind = "memory" | "mongo";

export type RateLimitKeyBy =
  | "ip"
  | "user"
  | "ip+identifier"
  | ((req: import("express").Request) => string | null);

export type RateLimitIncrementResult = {
  count: number;
  resetAt: number;
};

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitIncrementResult>;
  /** Current window count without incrementing; null if no active window. */
  get(key: string): Promise<RateLimitIncrementResult | null>;
  reset(key: string): Promise<void>;
}

export type RateLimitName =
  | "globalIp"
  | "loginIp"
  | "loginEmailFailures"
  | "registerIp"
  | "resetPasswordIp"
  | "otpSendIp"
  | "articleSyncUser"
  | "articleResyncOneUser"
  | "invoicePurchaseUser"
  | "invoicePurchaseIp"
  | "llmChatUser"
  | "llmChatIp"
  | "batchTestRunUser";

export type RateLimitConfigEntry = {
  name: RateLimitName;
  store: RateLimitStoreKind;
  windowMs: number;
  max: number;
  keyBy: RateLimitKeyBy;
  message: string;
  /** Body/query field name when keyBy is `ip+identifier`. */
  identifierField?: string;
};

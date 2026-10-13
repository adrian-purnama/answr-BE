import { parseBuild } from "./parseBuild";

export { parseBuild } from "./parseBuild";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return stripQuotes(value);
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(stripQuotes(raw));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.trunc(n);
}

function optionalNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(stripQuotes(raw));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return Math.trunc(n);
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  build: parseBuild(process.env.BUILD),
  /**
   * Express `trust proxy` hop count. `0` disables trusting forwarded headers.
   * Default `1` (one reverse-proxy hop).
   */
  trustProxy: optionalNonNegativeInt("TRUST_PROXY", 1),
  mongodbUrl: required("MONGODB_URL"),
  frontendUrl: required("FRONTEND_URL"),
  smtpHost: required("SMTP_HOST"),
  smtpPort: optionalPositiveInt("SMTP_PORT", 465),
  smtpSecure: stripQuotes(process.env.SMTP_SECURE ?? "true") === "true",
  smtpUser: required("SMTP_USER"),
  smtpPassword: required("SMTP_PASSWORD"),
  mailFrom: required("MAIL_FROM"),
  jwtSecret: required("JWT_SECRET"),
  /** PEM private key used to mint widget visitor JWTs (RS256). Newlines may be `\n`. */
  visitorJwtPrivateKeyPem: (process.env.VISITOR_JWT_PRIVATE_KEY_PEM ?? "")
    .replace(/\\n/g, "\n")
    .trim(),
  visitorJwtIssuer: (process.env.VISITOR_JWT_ISSUER ?? "").trim(),
  deepseekApiKey: (process.env.DEEPSEEK_API_KEY ?? "").trim(),
  deepseekBaseUrl: (
    process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
  )
    .trim()
    .replace(/\/$/, ""),
  layaBaseUrl: (process.env.LAYA_BASE_URL ?? "http://192.168.1.4:11436")
    .trim()
    .replace(/\/$/, ""),
  rerankerBaseUrl: (process.env.RERANKER_BASE_URL ?? "http://localhost:11435")
    .trim()
    .replace(/\/$/, ""),
  /** Gap-filler / plan cache worker interval (ms). Clamped 60s–5m. */
  planPeriodGapIntervalMs: (() => {
    const raw = Number(process.env.PLAN_PERIOD_GAP_INTERVAL_MS);
    const fallback = 120_000;
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(5 * 60_000, Math.max(60_000, Math.trunc(raw)));
  })(),
  midtransServerKey: required("MIDTRANS_SERVER_KEY"),
  midtransClientKey: required("MIDTRANS_CLIENT_KEY"),
  wahaApiUrl: required("WAHA_API_URL").replace(/\/$/, ""),
  wahaApiKey: required("WAHA_API_KEY"),
  /** Shared secret WAHA sends as X-Webhook-Secret. */
  wahaWebhookSecret: required("WAHA_WEBHOOK_SECRET"),
  /** Public base URL WAHA can reach for session webhooks. No trailing slash. */
  wahaWebhookBaseUrl: required("WAHA_WEBHOOK_BASE_URL").replace(/\/$/, ""),
  invoiceTtlMinutes: optionalPositiveInt("INVOICE_TTL_MINUTES", 15),
  invoicePurgeDays: optionalPositiveInt("INVOICE_PURGE_DAYS", 30),
};

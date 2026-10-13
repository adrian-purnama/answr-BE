import { logger } from "../logger/logger";
import { HttpError } from "../utils/httpError";
import { rateLimitConfig } from "./rateLimit.config";
import { getRateLimitStore } from "./stores";

const entry = rateLimitConfig.loginEmailFailures;

function keyFor(email: string): string {
  return `loginEmailFailures:email:${email}`;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/** Check failure count before password verification. Fail-open on store errors. */
export async function assertLoginEmailNotLocked(email: string): Promise<void> {
  const store = getRateLimitStore(entry.store);
  try {
    const current = await store.get(keyFor(email));
    if (current && current.count >= entry.max) {
      throw new HttpError(
        entry.message,
        429,
        retryAfterSeconds(current.resetAt),
      );
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(
      error instanceof Error ? error.message : String(error),
      "rateLimit/loginEmailFailures.ts",
      "assertLoginEmailNotLocked",
    );
  }
}

export async function recordLoginEmailFailure(email: string): Promise<void> {
  const store = getRateLimitStore(entry.store);
  try {
    await store.increment(keyFor(email), entry.windowMs);
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
      "rateLimit/loginEmailFailures.ts",
      "recordLoginEmailFailure",
    );
  }
}

export async function resetLoginEmailFailures(email: string): Promise<void> {
  const store = getRateLimitStore(entry.store);
  try {
    await store.reset(keyFor(email));
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
      "rateLimit/loginEmailFailures.ts",
      "resetLoginEmailFailures",
    );
  }
}

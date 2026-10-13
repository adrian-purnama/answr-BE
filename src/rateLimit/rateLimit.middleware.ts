import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../logger/logger";
import type { ApiResponseDto } from "../dto/apiResponse.dto";
import { clientIp } from "../utils/clientIp";
import { normalizeEmail } from "../utils/email";
import {
  GLOBAL_RATE_LIMIT_SKIP_PATHS,
  rateLimitConfig,
} from "./rateLimit.config";
import { getRateLimitStore } from "./stores";
import type { RateLimitName } from "./rateLimit.types";

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

function resolveKey(req: Request, name: RateLimitName): string | null {
  const entry = rateLimitConfig[name];
  const { keyBy } = entry;

  if (typeof keyBy === "function") {
    return keyBy(req);
  }

  if (keyBy === "ip") {
    const ip = clientIp(req);
    return ip ? `${name}:ip:${ip}` : null;
  }

  if (keyBy === "user") {
    const userId = req.user?._id?.toString();
    return userId ? `${name}:user:${userId}` : null;
  }

  // ip+identifier
  const ip = clientIp(req);
  const field = entry.identifierField ?? "email";
  const raw = req.body?.[field];
  const identifier =
    typeof raw === "string"
      ? field === "email"
        ? normalizeEmail(raw)
        : raw.trim()
      : "";
  if (!ip || !identifier) return null;
  return `${name}:ip:${ip}:${field}:${identifier}`;
}

function send429(
  res: Response,
  message: string,
  resetAt: number,
  max: number,
  remaining: number,
): void {
  const retry = retryAfterSeconds(resetAt);
  res.setHeader("Retry-After", String(retry));
  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  res.status(429).json({
    success: false,
    message,
    data: null,
    retryAfterSeconds: retry,
  } satisfies ApiResponseDto);
}

export function rateLimit(name: RateLimitName): RequestHandler {
  const entry = rateLimitConfig[name];
  const store = getRateLimitStore(entry.store);

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = resolveKey(req, name);
    if (!key) {
      return next();
    }

    try {
      const result = await store.increment(key, entry.windowMs);
      const remaining = entry.max - result.count;
      res.setHeader("RateLimit-Limit", String(entry.max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
      res.setHeader(
        "RateLimit-Reset",
        String(Math.ceil(result.resetAt / 1000)),
      );

      if (result.count > entry.max) {
        return send429(res, entry.message, result.resetAt, entry.max, 0);
      }
      return next();
    } catch (error) {
      if (entry.store === "mongo") {
        logger.error(
          error instanceof Error ? error.message : String(error),
          "rateLimit/rateLimit.middleware.ts",
          name,
        );
        return next();
      }
      return next(error);
    }
  };
}

/** Global IP limiter; skips health, Midtrans webhook, and WAHA webhooks. */
export function globalRateLimit(): RequestHandler {
  const entry = rateLimitConfig.globalIp;
  const store = getRateLimitStore(entry.store);

  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    if (
      GLOBAL_RATE_LIMIT_SKIP_PATHS.has(path) ||
      path.startsWith("/whatsapp/webhook/")
    ) {
      return next();
    }

    const ip = clientIp(req);
    if (!ip) return next();
    const key = `globalIp:ip:${ip}`;

    try {
      const result = await store.increment(key, entry.windowMs);
      const remaining = entry.max - result.count;
      res.setHeader("RateLimit-Limit", String(entry.max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
      res.setHeader(
        "RateLimit-Reset",
        String(Math.ceil(result.resetAt / 1000)),
      );

      if (result.count > entry.max) {
        return send429(res, entry.message, result.resetAt, entry.max, 0);
      }
      return next();
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        "rateLimit/rateLimit.middleware.ts",
        "globalIp",
      );
      // memory store should not fail; still fail closed only if unexpected
      return next(error);
    }
  };
}

/** Dev-only: log resolved client IP to verify TRUST_PROXY. */
export function debugClientIp(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    logger.debug(
      `req.ip=${req.ip ?? ""} clientIp=${clientIp(req)}`,
      "rateLimit",
      "debugClientIp",
    );
    next();
  };
}

export { retryAfterSeconds };

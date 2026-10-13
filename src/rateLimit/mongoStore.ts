import { RateLimitCounterModel } from "../models/rateLimit/rateLimitCounter.model";
import type {
  RateLimitIncrementResult,
  RateLimitStore,
} from "./rateLimit.types";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

type CounterLean = {
  key: string;
  count: number;
  expiresAt: Date;
};

export type MongoStoreOptions = {
  now?: () => number;
};

export class MongoStore implements RateLimitStore {
  private readonly now: () => number;

  constructor(options?: MongoStoreOptions) {
    this.now = options?.now ?? Date.now;
  }

  async increment(
    key: string,
    windowMs: number,
  ): Promise<RateLimitIncrementResult> {
    return this.incrementWithRetry(key, windowMs, true);
  }

  private async incrementWithRetry(
    key: string,
    windowMs: number,
    allowRetry: boolean,
  ): Promise<RateLimitIncrementResult> {
    const t = this.now();
    const nowDate = new Date(t);
    const expiresAt = new Date(t + windowMs);

    const active = await RateLimitCounterModel.findOneAndUpdate(
      { key, expiresAt: { $gt: nowDate } },
      { $inc: { count: 1 } },
      { new: true },
    ).lean<CounterLean | null>();
    if (active) {
      return { count: active.count, resetAt: active.expiresAt.getTime() };
    }

    try {
      await RateLimitCounterModel.create({ key, count: 1, expiresAt });
      return { count: 1, resetAt: expiresAt.getTime() };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const raced = await RateLimitCounterModel.findOneAndUpdate(
        { key, expiresAt: { $gt: nowDate } },
        { $inc: { count: 1 } },
        { new: true },
      ).lean<CounterLean | null>();
      if (raced) {
        return { count: raced.count, resetAt: raced.expiresAt.getTime() };
      }

      const rolled = await RateLimitCounterModel.findOneAndUpdate(
        { key, expiresAt: { $lte: nowDate } },
        { $set: { count: 1, expiresAt } },
        { new: true },
      ).lean<CounterLean | null>();
      if (rolled) {
        return { count: 1, resetAt: rolled.expiresAt.getTime() };
      }

      if (allowRetry) {
        return this.incrementWithRetry(key, windowMs, false);
      }
      throw error;
    }
  }

  async get(key: string): Promise<RateLimitIncrementResult | null> {
    const nowDate = new Date(this.now());
    const doc = await RateLimitCounterModel.findOne({
      key,
      expiresAt: { $gt: nowDate },
    }).lean<CounterLean | null>();
    if (!doc) return null;
    return { count: doc.count, resetAt: doc.expiresAt.getTime() };
  }

  async reset(key: string): Promise<void> {
    await RateLimitCounterModel.deleteOne({ key });
  }
}

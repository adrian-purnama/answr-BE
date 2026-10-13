import type {
  RateLimitIncrementResult,
  RateLimitStore,
} from "./rateLimit.types";

type Entry = {
  count: number;
  resetAt: number;
};

export type MemoryStoreOptions = {
  now?: () => number;
  /** Sweep interval. `null` disables the timer (tests). */
  sweepMs?: number | null;
};

const DEFAULT_SWEEP_MS = 60_000;

export class MemoryStore implements RateLimitStore {
  private readonly map = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;
  /** Serialize mutations so concurrent awaiters cannot race. */
  private chain: Promise<void> = Promise.resolve();

  constructor(options?: MemoryStoreOptions) {
    this.now = options?.now ?? Date.now;
    const sweepMs =
      options?.sweepMs === undefined ? DEFAULT_SWEEP_MS : options.sweepMs;
    if (sweepMs == null) {
      this.sweepTimer = null;
      return;
    }
    this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
    this.sweepTimer.unref();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private enqueue<T>(fn: () => T): Promise<T> {
    const run = this.chain.then(() => fn());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  increment(
    key: string,
    windowMs: number,
  ): Promise<RateLimitIncrementResult> {
    return this.enqueue(() => this.incrementSync(key, windowMs));
  }

  private incrementSync(
    key: string,
    windowMs: number,
  ): RateLimitIncrementResult {
    const t = this.now();
    const existing = this.map.get(key);
    if (!existing || existing.resetAt <= t) {
      const resetAt = t + windowMs;
      this.map.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    existing.count += 1;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  get(key: string): Promise<RateLimitIncrementResult | null> {
    return this.enqueue(() => {
      const t = this.now();
      const existing = this.map.get(key);
      if (!existing || existing.resetAt <= t) {
        if (existing) this.map.delete(key);
        return null;
      }
      return { count: existing.count, resetAt: existing.resetAt };
    });
  }

  reset(key: string): Promise<void> {
    return this.enqueue(() => {
      this.map.delete(key);
    });
  }

  sweep(): void {
    const t = this.now();
    for (const [key, entry] of this.map) {
      if (entry.resetAt <= t) this.map.delete(key);
    }
  }
}

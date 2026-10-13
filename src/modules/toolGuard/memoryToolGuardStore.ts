import {
  TOOL_GUARD_CLAIM_TTL_MS,
  TOOL_GUARD_INTENT_RULES,
  TOOL_GUARD_IP_MESSAGE_LIMIT,
  TOOL_GUARD_MESSAGE_WINDOW_MS,
  TOOL_GUARD_SESSION_MESSAGE_LIMIT,
  type ToolGuardClock,
  type ToolGuardIntent,
  type ToolGuardStore,
} from "./toolGuard.types";

type EmissionState = {
  count: number;
  lastAt: number;
};

type SessionEmissions = Partial<Record<ToolGuardIntent, EmissionState>>;

export type MemoryToolGuardStoreOptions = {
  now?: ToolGuardClock;
  /** Sweep interval. `null` disables the timer (tests). */
  sweepMs?: number | null;
};

const DEFAULT_SWEEP_MS = 60_000;

export class MemoryToolGuardStore implements ToolGuardStore {
  private readonly now: ToolGuardClock;
  private readonly sessionWindows = new Map<string, number[]>();
  private readonly ipWindows = new Map<string, number[]>();
  private readonly emissions = new Map<string, SessionEmissions>();
  private readonly claims = new Map<string, number>();
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(options?: MemoryToolGuardStoreOptions) {
    this.now = options?.now ?? Date.now;
    const sweepMs = options?.sweepMs === undefined ? DEFAULT_SWEEP_MS : options.sweepMs;
    if (sweepMs == null) {
      this.sweepTimer = null;
      return;
    }
    this.sweepTimer = setInterval(() => this.pruneExpired(), sweepMs);
    this.sweepTimer.unref();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  allowMessage(sessionId: string, ip: string): boolean {
    const t = this.now();
    const sessionKey = sessionId.trim();
    if (!sessionKey) return false;

    const sessionHits = this.pruneWindow(
      this.sessionWindows.get(sessionKey) ?? [],
      t,
    );
    if (sessionHits.length >= TOOL_GUARD_SESSION_MESSAGE_LIMIT) {
      this.sessionWindows.set(sessionKey, sessionHits);
      return false;
    }

    const ipKey = ip.trim();
    let ipHits: number[] | undefined;
    if (ipKey) {
      ipHits = this.pruneWindow(this.ipWindows.get(ipKey) ?? [], t);
      if (ipHits.length >= TOOL_GUARD_IP_MESSAGE_LIMIT) {
        this.ipWindows.set(ipKey, ipHits);
        this.sessionWindows.set(sessionKey, sessionHits);
        return false;
      }
    }

    sessionHits.push(t);
    this.sessionWindows.set(sessionKey, sessionHits);
    if (ipKey && ipHits) {
      ipHits.push(t);
      this.ipWindows.set(ipKey, ipHits);
    }
    return true;
  }

  canEmit(sessionId: string, intent: ToolGuardIntent): boolean {
    const t = this.now();
    const rule = TOOL_GUARD_INTENT_RULES[intent];
    const state = this.emissions.get(sessionId.trim())?.[intent];
    if (!state) return true;
    if (state.count >= rule.maxPerSession) return false;
    if (t - state.lastAt < rule.cooldownMs) return false;
    return true;
  }

  recordEmission(sessionId: string, intent: ToolGuardIntent): void {
    const t = this.now();
    const key = sessionId.trim();
    const current = this.emissions.get(key) ?? {};
    const prev = current[intent];
    current[intent] = {
      count: (prev?.count ?? 0) + 1,
      lastAt: t,
    };
    this.emissions.set(key, current);
  }

  claimWrite(idempotencyKey: string): boolean {
    const t = this.now();
    const key = idempotencyKey.trim();
    if (!key) return false;
    const expiresAt = this.claims.get(key);
    if (expiresAt != null && expiresAt > t) return false;
    this.claims.set(key, t + TOOL_GUARD_CLAIM_TTL_MS);
    return true;
  }

  pruneExpired(): void {
    const t = this.now();
    for (const [key, hits] of this.sessionWindows) {
      const next = this.pruneWindow(hits, t);
      if (next.length === 0) this.sessionWindows.delete(key);
      else this.sessionWindows.set(key, next);
    }
    for (const [key, hits] of this.ipWindows) {
      const next = this.pruneWindow(hits, t);
      if (next.length === 0) this.ipWindows.delete(key);
      else this.ipWindows.set(key, next);
    }
    for (const [key, expiresAt] of this.claims) {
      if (expiresAt <= t) this.claims.delete(key);
    }
  }

  private pruneWindow(hits: number[], t: number): number[] {
    const cutoff = t - TOOL_GUARD_MESSAGE_WINDOW_MS;
    let start = 0;
    while (start < hits.length && hits[start]! <= cutoff) start += 1;
    return start === 0 ? hits : hits.slice(start);
  }
}

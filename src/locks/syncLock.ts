import { SyncLockModel } from "../models/syncLock/syncLock.model";
import { HttpError } from "../utils/httpError";
import { SYNC_STUCK_MS } from "../utils/topicChunkSync";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export const DEFAULT_SYNC_LOCK_TTL_MS = SYNC_STUCK_MS;

export class SyncLockConflictError extends HttpError {
  constructor(message = "A sync is already running. Try again shortly.") {
    super(message, 409);
    this.name = "SyncLockConflictError";
  }
}

/**
 * Acquire a Mongo lock document. Returns true if acquired.
 * Stale locks (expiresAt <= now) can be stolen.
 */
export async function tryAcquireSyncLock(
  key: string,
  ttlMs: number = DEFAULT_SYNC_LOCK_TTL_MS,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    await SyncLockModel.create({ key, expiresAt });
    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const stolen = await SyncLockModel.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },
      { $set: { expiresAt } },
      { new: true },
    );
    return Boolean(stolen);
  }
}

export async function acquireSyncLockOrThrow(
  key: string,
  message?: string,
  ttlMs: number = DEFAULT_SYNC_LOCK_TTL_MS,
): Promise<void> {
  const ok = await tryAcquireSyncLock(key, ttlMs);
  if (!ok) {
    throw new SyncLockConflictError(message);
  }
}

export async function refreshSyncLock(
  key: string,
  ttlMs: number = DEFAULT_SYNC_LOCK_TTL_MS,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await SyncLockModel.updateOne({ key }, { $set: { expiresAt } });
}

export async function releaseSyncLock(key: string): Promise<void> {
  await SyncLockModel.deleteOne({ key });
}

/** Run `work` while holding a lock; refresh periodically; always release. */
export async function withSyncLock<T>(
  key: string,
  work: (refresh: () => Promise<void>) => Promise<T>,
  options?: { ttlMs?: number; refreshEveryMs?: number; conflictMessage?: string },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_SYNC_LOCK_TTL_MS;
  const refreshEveryMs = options?.refreshEveryMs ?? Math.min(ttlMs / 3, 5 * 60_000);
  await acquireSyncLockOrThrow(key, options?.conflictMessage, ttlMs);

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const refresh = async () => {
    await refreshSyncLock(key, ttlMs);
  };

  try {
    refreshTimer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, refreshEveryMs);
    refreshTimer.unref?.();
    return await work(refresh);
  } finally {
    if (refreshTimer) clearInterval(refreshTimer);
    await releaseSyncLock(key).catch(() => undefined);
  }
}

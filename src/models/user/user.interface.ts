import { Types } from "mongoose";

export interface UserInterface {
  email?: string;
  hashedPassword?: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
  /** Cached plan for the period containing now. */
  planId?: Types.ObjectId;
  /** Exclusive end of the cached current period (sentinel 9999 = never). */
  planPeriodUntil?: Date | null;
  /** @deprecated Legacy field; removed after plan-period migration. */
  planExpiresAt?: Date | null;
  /** Bumped on every plan-period mutating transaction (concurrency). */
  planVersion?: number;
}

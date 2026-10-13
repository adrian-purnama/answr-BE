import type { Types } from "mongoose";

export type ConflictingPeriodPayload = {
  id: string;
  userId: string;
  planId: string;
  effectiveDate: string;
  untilDate: string;
  source: string;
};

export class PlanPeriodConflictError extends Error {
  readonly statusCode = 409;
  readonly conflict: ConflictingPeriodPayload;

  constructor(message: string, conflict: ConflictingPeriodPayload) {
    super(message);
    this.name = "PlanPeriodConflictError";
    this.conflict = conflict;
  }
}

export function toConflictPayload(doc: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  effectiveDate: Date;
  untilDate: Date;
  source: string;
}): ConflictingPeriodPayload {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    planId: doc.planId.toString(),
    effectiveDate: doc.effectiveDate.toISOString(),
    untilDate: doc.untilDate.toISOString(),
    source: doc.source,
  };
}

export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; message?: string };
  return e.code === 11000 || (typeof e.message === "string" && e.message.includes("E11000"));
}

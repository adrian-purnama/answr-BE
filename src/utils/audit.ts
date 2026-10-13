import { Types } from "mongoose";

export function createAudit(actorId: Types.ObjectId): {
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
} {
  return { createdBy: actorId, updatedBy: actorId };
}

export function updateAudit(actorId: Types.ObjectId): {
  updatedBy: Types.ObjectId;
} {
  return { updatedBy: actorId };
}

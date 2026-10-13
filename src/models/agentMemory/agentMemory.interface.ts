import type { Types } from "mongoose";

export interface AgentMemoryInterface {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  /** Stable key, e.g. user.preferred_name */
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

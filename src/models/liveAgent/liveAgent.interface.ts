import type { Types } from "mongoose";

export interface LiveAgentInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  name: string;
  enabled: boolean;
  profilePicture: string;
  /** bcrypt hash   never expose in API responses */
  hashedPassword: string;
  createdAt: Date;
  updatedAt: Date;
}

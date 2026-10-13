import type { Types } from "mongoose";

export interface GuidanceInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

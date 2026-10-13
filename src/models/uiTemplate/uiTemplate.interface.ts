import type { Types } from "mongoose";

export interface UiTemplateInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

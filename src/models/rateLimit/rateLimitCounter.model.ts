import { model, Schema } from "mongoose";

export interface RateLimitCounterInterface {
  key: string;
  count: number;
  expiresAt: Date;
}

const rateLimitCounterSchema = new Schema<RateLimitCounterInterface>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

rateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitCounterModel = model<RateLimitCounterInterface>(
  "RateLimitCounter",
  rateLimitCounterSchema,
);

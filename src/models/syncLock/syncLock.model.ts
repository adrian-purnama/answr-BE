import { model, Schema } from "mongoose";

export interface SyncLockInterface {
  key: string;
  expiresAt: Date;
}

const syncLockSchema = new Schema<SyncLockInterface>(
  {
    key: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

syncLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SyncLockModel = model<SyncLockInterface>("SyncLock", syncLockSchema);

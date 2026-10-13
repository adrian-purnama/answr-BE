import { Types } from "mongoose";
import { logger } from "../../logger/logger";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";

const logSource = "modules/user/syncApiKeysToPlanLimit.ts";

/**
 * Keep the oldest `maxApiKeys` non-revoked keys active; set the rest to
 * `disabled_plan`. Re-enables keys that were previously disabled by plan.
 * Never touches `revoked` keys. Sort by `_id` (creation order; no timestamps).
 */
export async function syncApiKeysToPlanLimit(
  userId: Types.ObjectId,
  maxApiKeys: number,
): Promise<{ enabled: number; disabled: number }> {
  const limit = Math.max(0, Math.trunc(maxApiKeys));
  const keys = await ApiKeyModel.find({
    userId,
    "status.status": { $ne: "revoked" },
  })
    .sort({ _id: 1 })
    .select("_id status.status")
    .lean<Array<{ _id: Types.ObjectId; status: { status: string } }>>();

  const now = new Date();
  const toEnable: Types.ObjectId[] = [];
  const toDisable: Types.ObjectId[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) continue;
    if (i < limit) {
      if (key.status.status === "disabled_plan") {
        toEnable.push(key._id);
      }
    } else if (key.status.status === "active") {
      toDisable.push(key._id);
    }
  }

  if (toEnable.length > 0) {
    await ApiKeyModel.updateMany(
      { _id: { $in: toEnable } },
      {
        $set: {
          "status.status": "active",
          "status.appliedAt": now,
        },
      },
    );
  }

  if (toDisable.length > 0) {
    await ApiKeyModel.updateMany(
      { _id: { $in: toDisable } },
      {
        $set: {
          "status.status": "disabled_plan",
          "status.appliedAt": now,
        },
      },
    );
  }

  if (toEnable.length > 0 || toDisable.length > 0) {
    logger.info(
      `Synced API keys for user ${userId.toString()}: enabled=${toEnable.length}, disabled=${toDisable.length}, limit=${limit}`,
      logSource,
      "syncApiKeysToPlanLimit",
    );
  }

  return { enabled: toEnable.length, disabled: toDisable.length };
}

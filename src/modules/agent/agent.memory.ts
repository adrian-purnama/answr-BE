import { Types } from "mongoose";
import { AgentMemoryModel } from "../../models/agentMemory/agentMemory.model";
import type { AgentMemoryInterface } from "../../models/agentMemory/agentMemory.interface";

export const MEMORY_CAP = 50;

export type MemoryEntry = {
  key: string;
  value: string;
};

export type MemoryUpdates = {
  upserts: MemoryEntry[];
  deletes: string[];
};

type MemoryDoc = AgentMemoryInterface & { _id: Types.ObjectId };

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

export async function listMemories(
  sessionId: Types.ObjectId,
): Promise<MemoryEntry[]> {
  const docs = await AgentMemoryModel.find({ sessionId })
    .sort({ updatedAt: -1 })
    .lean<MemoryDoc[]>();

  return docs.map((doc) => ({
    key: doc.key,
    value: doc.value,
  }));
}

export async function applyMemoryUpdates(
  sessionId: Types.ObjectId,
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  updates: MemoryUpdates,
): Promise<string[]> {
  const touched = new Set<string>();

  for (const key of updates.deletes) {
    const normalized = normalizeKey(key);
    if (!normalized) continue;
    const result = await AgentMemoryModel.deleteOne({
      sessionId,
      key: normalized,
    });
    if (result.deletedCount > 0) {
      touched.add(normalized);
    }
  }

  for (const entry of updates.upserts) {
    const key = normalizeKey(entry.key);
    const value = entry.value.trim();
    if (!key || !value) continue;

    await AgentMemoryModel.findOneAndUpdate(
      { sessionId, key },
      { $set: { value, userId, apiKeyId } },
      { upsert: true, new: true },
    );
    touched.add(key);
  }

  const count = await AgentMemoryModel.countDocuments({ sessionId });
  if (count > MEMORY_CAP) {
    const overflow = count - MEMORY_CAP;
    const oldest = await AgentMemoryModel.find({ sessionId })
      .sort({ updatedAt: 1 })
      .limit(overflow)
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (oldest.length > 0) {
      await AgentMemoryModel.deleteMany({
        _id: { $in: oldest.map((doc) => doc._id) },
      });
    }
  }

  return [...touched];
}

export async function deleteMemoriesForSession(
  sessionId: Types.ObjectId,
): Promise<void> {
  await AgentMemoryModel.deleteMany({ sessionId });
}

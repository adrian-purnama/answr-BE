import { model, Schema } from "mongoose";
import type { AgentMemoryInterface } from "./agentMemory.interface";

const agentMemorySchema = new Schema<AgentMemoryInterface>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "ChatSession",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

agentMemorySchema.index({ sessionId: 1, key: 1 }, { unique: true });
agentMemorySchema.index({ sessionId: 1, updatedAt: 1 });

export const AgentMemoryModel = model<AgentMemoryInterface>(
  "AgentMemory",
  agentMemorySchema,
);

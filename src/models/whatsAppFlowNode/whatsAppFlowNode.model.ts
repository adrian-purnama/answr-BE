import { Schema, model } from "mongoose";
import type { WhatsAppFlowNodeInterface } from "./whatsAppFlowNode.interface";

const flowOptionSchema = new Schema(
  {
    label: { type: String, required: true },
    targetNodeId: { type: String, required: true },
  },
  { _id: false },
);

const flowFieldSchema = new Schema(
  {
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, required: true },
  },
  { _id: false },
);

const whatsAppFlowNodeSchema = new Schema<WhatsAppFlowNodeInterface>(
  {
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
    position: { type: Number, required: true },
    id: { type: String, required: true },
    type: { type: String, enum: ["menu", "leaf"], required: true },
    root: { type: Boolean, required: true },
    // Empty string is valid. Mongoose `required` rejects "".
    header: { type: String, default: "" },
    options: { type: [flowOptionSchema], required: true, default: [] },
    leafType: {
      type: String,
      enum: ["text", "function_call", "agent_support", "form", null],
      default: null,
    },
    body: { type: String, default: "" },
    functionName: { type: String, default: "" },
    label: { type: String, default: "" },
    parameters: { type: String, default: "" },
    askParameters: { type: Boolean, default: false },
    handoffTarget: { type: String, default: "" },
    fields: { type: [flowFieldSchema], required: true, default: [] },
  },
  { timestamps: true },
);

whatsAppFlowNodeSchema.index(
  { userId: 1, apiKeyId: 1, id: 1 },
  { unique: true },
);

export const WhatsAppFlowNodeModel = model<WhatsAppFlowNodeInterface>(
  "WhatsAppFlowNode",
  whatsAppFlowNodeSchema,
);

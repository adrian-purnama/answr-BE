import type { Types } from "mongoose";

export type FlowOption = {
  label: string;
  targetNodeId: string;
};

export type FlowField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
};

export type FlowLeafType = "text" | "function_call" | "agent_support" | "form";

type FlowNodeBase = {
  id: string;
  root: boolean;
};

export type FlowMenuNode = FlowNodeBase & {
  type: "menu";
  header: string;
  options: FlowOption[];
};

export type FlowLeafNode = FlowNodeBase &
  (
    | { type: "leaf"; leafType: "text"; body: string }
    | {
        type: "leaf";
        leafType: "function_call";
        label: string;
        functionName: string;
        parameters: string;
        askParameters: boolean;
      }
    | { type: "leaf"; leafType: "agent_support"; handoffTarget: string }
    | { type: "leaf"; leafType: "form"; fields: FlowField[] }
  );

export type FlowNode = FlowMenuNode | FlowLeafNode;

/** Stored row. `position` keeps the editor order and is not part of the public node. */
export interface WhatsAppFlowNodeInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  position: number;
  id: string;
  type: "menu" | "leaf";
  root: boolean;
  header: string;
  options: FlowOption[];
  leafType: FlowLeafType | null;
  body: string;
  functionName: string;
  label: string;
  parameters: string;
  askParameters: boolean;
  handoffTarget: string;
  fields: FlowField[];
}

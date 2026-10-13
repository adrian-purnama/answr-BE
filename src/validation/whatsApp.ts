import type { UpdateWhatsAppSettingsDto } from "../dto/whatsApp.dto";
import type {
  FlowLeafType,
  FlowNode,
  FlowOption,
} from "../models/whatsAppFlowNode/whatsAppFlowNode.interface";

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

export function parseUpdateWhatsAppSettingsDto(
  body: unknown,
): UpdateWhatsAppSettingsDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateWhatsAppSettingsDto = {};
  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "enabled");
  }
  if ("defaultFlow" in raw) {
    patch.defaultFlow = parseBoolean(raw.defaultFlow, "defaultFlow");
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }
  return patch;
}

function textOf(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.trim();
}

function parseOption(value: unknown, index: number): FlowOption {
  if (!value || typeof value !== "object") {
    throw new Error(`Option ${index + 1} is invalid`);
  }
  const raw = value as Record<string, unknown>;
  const label = textOf(raw.label, `Option ${index + 1} label`);
  const targetNodeId = textOf(raw.targetNodeId, `Option ${index + 1} target`);
  if (label === "Back") throw new Error("Back is reserved");
  if (!label) throw new Error(`Option ${index + 1} needs a label`);
  if (!targetNodeId) throw new Error(`Option ${index + 1} needs a target`);
  return { label, targetNodeId };
}

const leafTypes: readonly FlowLeafType[] = [
  "text",
  "function_call",
  "agent_support",
  "form",
];

function parseNode(value: unknown, index: number): FlowNode {
  if (!value || typeof value !== "object") {
    throw new Error(`Flow node ${index + 1} is invalid`);
  }
  const raw = value as Record<string, unknown>;
  const id = textOf(raw.id, `Flow node ${index + 1} id`);
  if (!id) throw new Error(`Flow node ${index + 1} needs an id`);
  if (typeof raw.root !== "boolean") {
    throw new Error(`Flow node ${index + 1} root must be a boolean`);
  }
  if (raw.type === "menu") {
    if (!Array.isArray(raw.options)) {
      throw new Error(`Flow node ${index + 1} options must be a list`);
    }
    const options = raw.options.map((option, optionIndex) =>
      parseOption(option, optionIndex),
    );
    const labels = new Set<string>();
    for (const option of options) {
      if (labels.has(option.label)) {
        throw new Error(`Option labels must be unique in node ${id}`);
      }
      labels.add(option.label);
    }
    return {
      id,
      type: "menu",
      root: raw.root,
      header: textOf(raw.header, `Flow node ${index + 1} header`),
      options,
    };
  }
  if (raw.type !== "leaf") {
    throw new Error(`Flow node ${index + 1} type is invalid`);
  }
  const leafType = raw.leafType;
  if (typeof leafType !== "string" || !leafTypes.includes(leafType as FlowLeafType)) {
    throw new Error(`Flow node ${index + 1} leaf type is invalid`);
  }
  const base = { id, type: "leaf" as const, root: raw.root };
  if (leafType === "text") {
    return { ...base, leafType, body: textOf(raw.body, `Flow node ${index + 1} body`) };
  }
  if (leafType === "function_call") {
    return {
      ...base,
      leafType,
      label: textOf(raw.label, `Flow node ${index + 1} label`),
      functionName: textOf(raw.functionName, `Flow node ${index + 1} function name`),
      parameters: textOf(raw.parameters, `Flow node ${index + 1} parameters`),
      askParameters: raw.askParameters === true,
    };
  }
  if (leafType === "agent_support") {
    return {
      ...base,
      leafType,
      handoffTarget: textOf(raw.handoffTarget, `Flow node ${index + 1} handoff target`),
    };
  }
  return { ...base, leafType: "form", fields: [] };
}

/** Empty list is valid. A non-empty list needs exactly one root and live targets. */
export function parseFlowNodes(body: unknown): FlowNode[] {
  if (!Array.isArray(body)) throw new Error("Flow nodes must be an array");
  if (body.length === 0) return [];
  const nodes = body.map((item, index) => parseNode(item, index));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("Flow node ids must be unique");
  if (nodes.filter((node) => node.root).length !== 1) {
    throw new Error("Flow must have one root node");
  }
  for (const node of nodes) {
    if (node.type !== "menu") continue;
    for (const option of node.options) {
      if (!ids.has(option.targetNodeId)) {
        throw new Error(`Option target does not exist in node ${node.id}`);
      }
    }
  }
  return nodes;
}

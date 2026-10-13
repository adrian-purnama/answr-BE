import { Types } from "mongoose";
import type { CollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

export function parseCollaboratorUserId(
  param: string | string[] | undefined,
): Types.ObjectId {
  const id = Array.isArray(param) ? param[0] : param;
  if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
    throw new Error("Invalid user id");
  }
  return new Types.ObjectId(id);
}

export function parseCollaboratorPermissions(body: unknown): CollaboratorPermissions {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const source =
    "permissions" in raw && raw.permissions && typeof raw.permissions === "object"
      ? (raw.permissions as Record<string, unknown>)
      : raw;

  const trainRaw = source.train;
  if (!trainRaw || typeof trainRaw !== "object") {
    throw new Error("permissions.train is required");
  }
  const toolsRaw = source.tools;
  if (!toolsRaw || typeof toolsRaw !== "object") {
    throw new Error("permissions.tools is required");
  }
  const train = trainRaw as Record<string, unknown>;
  const tools = toolsRaw as Record<string, unknown>;

  const permissions: CollaboratorPermissions = {
    overview: parseBoolean(source.overview, "overview"),
    performance: parseBoolean(source.performance, "performance"),
    gaps: parseBoolean(source.gaps, "gaps"),
    train: {
      articleSnippet: parseBoolean(train.articleSnippet, "train.articleSnippet"),
      guidance: parseBoolean(train.guidance, "train.guidance"),
    },
    test: parseBoolean(source.test, "test"),
    tools: {
      liveAgent: parseBoolean(tools.liveAgent, "tools.liveAgent"),
      meeting: parseBoolean(tools.meeting, "tools.meeting"),
      mcp: parseBoolean(tools.mcp, "tools.mcp"),
      leadCapture: parseBoolean(tools.leadCapture, "tools.leadCapture"),
      whatsApp: parseBoolean(tools.whatsApp, "tools.whatsApp"),
    },
    widget: parseBoolean(source.widget, "widget"),
  };

  return permissions;
}

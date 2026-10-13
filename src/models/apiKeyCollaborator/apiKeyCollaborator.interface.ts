import type { Types } from "mongoose";

export const COLLABORATOR_PERMISSION_DEFAULTS = {
  overview: false,
  performance: false,
  gaps: false,
  train: { articleSnippet: false, guidance: false },
  test: false,
  tools: {
    liveAgent: false,
    meeting: false,
    mcp: false,
    leadCapture: false,
    whatsApp: false,
  },
  widget: false,
} as const;

export type CollaboratorPermissions = {
  overview: boolean;
  performance: boolean;
  gaps: boolean;
  train: { articleSnippet: boolean; guidance: boolean };
  test: boolean;
  tools: {
    liveAgent: boolean;
    meeting: boolean;
    mcp: boolean;
    leadCapture: boolean;
    whatsApp: boolean;
  };
  widget: boolean;
};

export function defaultCollaboratorPermissions(): CollaboratorPermissions {
  return {
    overview: COLLABORATOR_PERMISSION_DEFAULTS.overview,
    performance: COLLABORATOR_PERMISSION_DEFAULTS.performance,
    gaps: COLLABORATOR_PERMISSION_DEFAULTS.gaps,
    train: { ...COLLABORATOR_PERMISSION_DEFAULTS.train },
    test: COLLABORATOR_PERMISSION_DEFAULTS.test,
    tools: { ...COLLABORATOR_PERMISSION_DEFAULTS.tools },
    widget: COLLABORATOR_PERMISSION_DEFAULTS.widget,
  };
}

export const API_KEY_PERMISSION_VALUES = [
  "overview",
  "performance",
  "gaps",
  "train.articleSnippet",
  "train.guidance",
  "test",
  "tools.liveAgent",
  "tools.meeting",
  "tools.mcp",
  "tools.leadCapture",
  "tools.whatsApp",
  "widget",
] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSION_VALUES)[number];

export function ownerCollaboratorPermissions(): CollaboratorPermissions {
  return {
    overview: true,
    performance: true,
    gaps: true,
    train: { articleSnippet: true, guidance: true },
    test: true,
    tools: {
      liveAgent: true,
      meeting: true,
      mcp: true,
      leadCapture: true,
      whatsApp: true,
    },
    widget: true,
  };
}

export interface ApiKeyCollaboratorInterface {
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
  permissions: CollaboratorPermissions;
  createdAt: Date;
  updatedAt: Date;
}

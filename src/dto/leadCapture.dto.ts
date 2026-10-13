import type {
  LeadAsk,
  LeadCaptureStrategy,
  LeadFieldConfig,
  LeadFieldValue,
  LeadQualification,
  LeadStatus,
} from "../models/leadCapture/leadCapture.interface";

export interface LeadCaptureSettingsOutDto {
  apiKeyId: string;
  enabled: boolean;
  strategy: LeadCaptureStrategy;
  fields: LeadFieldConfig[];
}

export interface UpdateLeadCaptureSettingsDto {
  enabled?: boolean;
  strategy?: LeadCaptureStrategy;
  fields?: LeadFieldConfig[];
}

export interface LeadOutDto {
  id: string;
  apiKeyId: string;
  chatSessionId: string;
  status: LeadStatus;
  fieldValues: LeadFieldValue[];
  summary: string;
  createdAt: string;
  updatedAt: string;
  /** When MongoDB deletes this lead (createdAt + 30 days). */
  expiresAt: string;
}

export interface LeadAgentActionResultDto {
  submitted: boolean;
  status: LeadStatus;
  missingRequired: string[];
  ask: LeadAsk;
  gathered: Record<string, string>;
  instruction: string;
  alreadyCaptured: boolean;
}

export interface LeadMessageOutDto {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface LeadExportOutDto {
  csv: string;
}

export interface ApplyLeadAgentActionDto {
  sessionId: string;
  action: "record" | "submit";
  fields: Record<string, string>;
  qualification?: LeadQualification;
  summary?: string;
}

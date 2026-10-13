import { randomUUID } from "crypto";
import type { Types } from "mongoose";

export const LEAD_FIELD_TYPE_VALUES = [
  "name",
  "email",
  "phone",
  "company",
  "text",
] as const;

export type LeadFieldType = (typeof LEAD_FIELD_TYPE_VALUES)[number];

export const LEAD_CAPTURE_STRATEGY_VALUES = [
  "subtle",
  "aggressive",
  "adaptive",
] as const;

export type LeadCaptureStrategy = (typeof LEAD_CAPTURE_STRATEGY_VALUES)[number];

export const LEAD_STATUS_VALUES = [
  "gathering",
  "lead",
  "qualified",
  "hot",
] as const;

export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

export const LEAD_SUMMARY_JOB_STATUS_VALUES = [
  "none",
  "pending",
  "running",
  "done",
  "failed",
] as const;

export type LeadSummaryJobStatus =
  (typeof LEAD_SUMMARY_JOB_STATUS_VALUES)[number];

export const LEAD_QUALIFICATION_VALUES = ["lead", "qualified", "hot"] as const;

export type LeadQualification = (typeof LEAD_QUALIFICATION_VALUES)[number];

export type LeadAsk = "now" | "opportunity" | "relevant";

export interface LeadFieldConfig {
  id: string;
  key: string;
  label: string;
  type: LeadFieldType;
  required: boolean;
  order: number;
}

/** Project-level lead capture config, stored on the API key. */
export interface LeadCaptureSettingsInterface {
  enabled: boolean;
  strategy: LeadCaptureStrategy;
  fields: LeadFieldConfig[];
}

export interface LeadFieldValue {
  fieldId: string;
  key: string;
  label: string;
  value: string;
}

export interface LeadInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  chatSessionId: Types.ObjectId;
  status: LeadStatus;
  fieldValues: LeadFieldValue[];
  summary: string;
  /** Ollama summary worker queue state. */
  summaryJobStatus: LeadSummaryJobStatus;
  summaryJobAttempts: number;
  summaryJobClaimedAt: Date | null;
  summaryJobNextAt: Date | null;
  summaryJobLastError: string;
  createdAt: Date;
  updatedAt: Date;
}

export function defaultLeadCaptureFields(): LeadFieldConfig[] {
  return [
    {
      id: randomUUID(),
      key: "name",
      label: "Name",
      type: "name",
      required: false,
      order: 0,
    },
    {
      id: randomUUID(),
      key: "email",
      label: "Email",
      type: "email",
      required: true,
      order: 1,
    },
    {
      id: randomUUID(),
      key: "phone",
      label: "Phone",
      type: "phone",
      required: false,
      order: 2,
    },
    {
      id: randomUUID(),
      key: "company",
      label: "Company",
      type: "company",
      required: false,
      order: 3,
    },
  ];
}

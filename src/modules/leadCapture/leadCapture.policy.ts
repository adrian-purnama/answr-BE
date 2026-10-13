import type {
  LeadAsk,
  LeadCaptureStrategy,
  LeadFieldConfig,
  LeadFieldValue,
  LeadQualification,
  LeadStatus,
} from "../../models/leadCapture/leadCapture.interface";

export const LEAD_FIELD_VALUE_MAX = 500;
export const LEAD_SUMMARY_MAX = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]{6,}$/;

export type LeadWriteDecision = {
  status: LeadStatus;
  values: Record<string, string>;
  fieldValues: LeadFieldValue[];
  submitted: boolean;
  missingRequired: string[];
  ask: LeadAsk;
  summary: string;
  instruction: string;
};

export function askForStrategy(
  strategy: LeadCaptureStrategy,
  qualification: LeadQualification | null,
): LeadAsk {
  if (strategy === "aggressive") return "now";
  if (strategy === "subtle") return "opportunity";
  if (qualification === "hot") return "now";
  if (qualification === "qualified") return "relevant";
  return "opportunity";
}

export function askInstruction(ask: LeadAsk, missing: string[]): string {
  if (missing.length === 0) {
    return "Required fields are complete.";
  }
  const list = missing.join(", ");
  if (ask === "now") {
    return `Ask naturally for the missing required fields (${list}) in your next reply. Do not use a form. Do not submit again until they are gathered.`;
  }
  if (ask === "relevant") {
    return `Ask for the missing required fields (${list}) only if this turn already shows clear buying intent. Otherwise continue the conversation.`;
  }
  return `Continue the normal conversation. Ask for the missing required fields (${list}) only when there is a natural opportunity. Do not force the question.`;
}

export function missingRequiredKeys(
  fields: Array<Pick<LeadFieldConfig, "key" | "required">>,
  values: Record<string, string>,
): string[] {
  return fields
    .filter((field) => field.required && !values[field.key]?.trim())
    .map((field) => field.key);
}

function acceptValue(field: LeadFieldConfig, raw: string): string | null {
  const trimmed = raw.trim().slice(0, LEAD_FIELD_VALUE_MAX);
  if (!trimmed) return null;
  if (field.type === "email" && !EMAIL_RE.test(trimmed)) return null;
  if (field.type === "phone" && !PHONE_RE.test(trimmed)) return null;
  return trimmed;
}

/** Keep only configured keys. Empty and invalid values are dropped. */
export function sanitizeIncomingFields(
  fields: LeadFieldConfig[],
  raw: Record<string, string>,
): Record<string, string> {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const field = byKey.get(key.trim().toLowerCase());
    if (!field) continue;
    const accepted = acceptValue(field, value);
    if (accepted) out[field.key] = accepted;
  }
  return out;
}

export function valuesToMap(fieldValues: LeadFieldValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fieldValues) {
    if (entry.value.trim()) out[entry.key] = entry.value.trim();
  }
  return out;
}

function toFieldValues(
  fields: LeadFieldConfig[],
  values: Record<string, string>,
): LeadFieldValue[] {
  return fields.flatMap((field) => {
    const value = values[field.key]?.trim();
    if (!value) return [];
    return [
      {
        fieldId: field.id,
        key: field.key,
        label: field.label,
        value,
      },
    ];
  });
}

function isQualification(status: LeadStatus | null): status is LeadQualification {
  return status === "lead" || status === "qualified" || status === "hot";
}

export function decideLeadWrite(input: {
  action: "record" | "submit";
  strategy: LeadCaptureStrategy;
  qualification: LeadQualification | null;
  fields: LeadFieldConfig[];
  existingValues: Record<string, string>;
  existingStatus: LeadStatus | null;
  existingSummary: string;
  incoming: Record<string, string>;
  summary?: string;
}): LeadWriteDecision {
  const overlay = sanitizeIncomingFields(input.fields, input.incoming);
  const values: Record<string, string> = {};
  for (const field of input.fields) {
    const next = overlay[field.key] ?? input.existingValues[field.key];
    if (next?.trim()) values[field.key] = next.trim();
  }

  const missingRequired = missingRequiredKeys(input.fields, values);
  const ask = askForStrategy(
    input.strategy,
    input.action === "submit" ? input.qualification : null,
  );
  const incomingSummary = (input.summary ?? "").trim().slice(0, LEAD_SUMMARY_MAX);
  const summary =
    input.action === "submit" && incomingSummary
      ? incomingSummary
      : input.existingSummary.trim().slice(0, LEAD_SUMMARY_MAX);

  const submitted = input.action === "submit" && missingRequired.length === 0;
  const status: LeadStatus = submitted
    ? (input.qualification ?? "lead")
    : isQualification(input.existingStatus)
      ? input.existingStatus
      : "gathering";

  return {
    status,
    values,
    fieldValues: toFieldValues(input.fields, values),
    submitted,
    missingRequired,
    ask,
    summary,
    instruction: askInstruction(ask, missingRequired),
  };
}

import { Types } from "mongoose";
import { parseApiKeyId } from "./apiKey";
import {
  WIDGET_AI_FEEDBACK_TRIGGERS,
  type WidgetAiFeedbackTrigger,
} from "../models/widgetAiFeedback/widgetAiFeedback.interface";
import type { SubmitWidgetAiFeedbackDto } from "../dto/widgetAnalytics.dto";

function parseOptionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${field} must be a date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return date;
}

export function parseWidgetAnalyticsSummaryQuery(query: unknown): {
  apiKeyId: Types.ObjectId;
  from?: Date;
  to?: Date;
} {
  if (!query || typeof query !== "object") {
    throw new Error("Invalid query");
  }
  const raw = query as Record<string, unknown>;
  return {
    apiKeyId: parseApiKeyId(raw.apiKeyId),
    from: parseOptionalDate(raw.from, "from"),
    to: parseOptionalDate(raw.to, "to"),
  };
}

export function parseSubmitWidgetAiFeedbackDto(
  body: unknown,
): SubmitWidgetAiFeedbackDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const stars = raw.stars;
  if (
    typeof stars !== "number" ||
    !Number.isInteger(stars) ||
    stars < 1 ||
    stars > 5
  ) {
    throw new Error("stars must be an integer from 1 to 5");
  }
  let feedback: string | undefined;
  if ("feedback" in raw) {
    if (typeof raw.feedback !== "string") {
      throw new Error("feedback must be a string");
    }
    feedback = raw.feedback.trim().slice(0, 2000);
  }
  if (
    typeof raw.trigger !== "string" ||
    !(WIDGET_AI_FEEDBACK_TRIGGERS as readonly string[]).includes(raw.trigger)
  ) {
    throw new Error("trigger must be resolved or session_end");
  }
  return {
    stars,
    feedback,
    trigger: raw.trigger as WidgetAiFeedbackTrigger,
  };
}

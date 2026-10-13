import { Types } from "mongoose";

export const MEETING_FIELD_TYPE_VALUES = [
  "email",
  "firstName",
  "lastName",
  "company",
  "phone",
  "text",
] as const;

export type MeetingFieldType = (typeof MEETING_FIELD_TYPE_VALUES)[number];

export interface MeetingFieldConfig {
  id: string;
  type: MeetingFieldType;
  label: string;
  required: boolean;
  order: number;
  /** When true on an email field, booking sends confirmation to owner + visitor. */
  sendConfirmation?: boolean;
}

/** Local time range in config timezone, "HH:mm" */
export interface MeetingTimeRange {
  startTime: string;
  endTime: string;
}

/** Bookable operating window; capacity applies to each generated slot in this window. */
export interface MeetingAvailabilityWindow extends MeetingTimeRange {
  /** Max concurrent bookings for each exact generated period in this window. */
  capacity: number;
}

export interface WeeklyDaySchedule {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  enabled: boolean;
  windows: MeetingAvailabilityWindow[];
  breaks: MeetingTimeRange[];
}

/**
 * @deprecated Legacy flat weekly hours. Prefer WeeklyDaySchedule.
 * Kept for reading older documents during migration.
 */
export interface WeeklyHourRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Normalize tool names so hyphen/underscore variants match. */
export function normalizeAgentToolNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, "_");
}

/** Built-in agent tool name for a topic slug (underscores only   LLMs rewrite hyphens). */
export function meetingTopicToolName(slug: string): string {
  return `book_meeting_${normalizeAgentToolNameKey(slug)}`;
}

/** Suffix after book_meeting_ (underscore form; prefer topic.slug for markers). */
export function slugFromMeetingTopicToolName(toolName: string): string | null {
  const prefix = "book_meeting_";
  const lower = toolName.trim().toLowerCase();
  if (!lower.startsWith(prefix)) return null;
  const slug = lower.slice(prefix.length).trim();
  return slug || null;
}

export function migrateWeeklyHoursToSchedule(
  weeklyHours: WeeklyHourRule[] | undefined | null,
): WeeklyDaySchedule[] {
  const byDay = new Map<number, MeetingAvailabilityWindow[]>();
  for (const rule of weeklyHours ?? []) {
    if (
      typeof rule.dayOfWeek !== "number" ||
      rule.dayOfWeek < 0 ||
      rule.dayOfWeek > 6
    ) {
      continue;
    }
    const list = byDay.get(rule.dayOfWeek) ?? [];
    list.push({
      startTime: rule.startTime,
      endTime: rule.endTime,
      capacity: 1,
    });
    byDay.set(rule.dayOfWeek, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, windows]) => ({
      dayOfWeek,
      enabled: true,
      windows,
      breaks: [],
    }));
}

export interface MeetingTopicInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  name: string;
  slug: string;
  enabled: boolean;
  allowConflict: boolean;
  timezone: string;
  slotDurationMinutes: number;
  bookingHorizonDays: number;
  fields: MeetingFieldConfig[];
  weeklySchedule: WeeklyDaySchedule[];
  /** @deprecated Prefer weeklySchedule. Retained for legacy documents. */
  weeklyHours?: WeeklyHourRule[];
  /** Dates in config timezone as "YYYY-MM-DD" */
  blackoutDates: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function resolveWeeklySchedule(
  topic: Pick<MeetingTopicInterface, "weeklySchedule" | "weeklyHours">,
): WeeklyDaySchedule[] {
  if (Array.isArray(topic.weeklySchedule) && topic.weeklySchedule.length > 0) {
    return topic.weeklySchedule;
  }
  return migrateWeeklyHoursToSchedule(topic.weeklyHours);
}

/** @deprecated Use MeetingTopicInterface */
export type MeetingToolConfigInterface = MeetingTopicInterface;

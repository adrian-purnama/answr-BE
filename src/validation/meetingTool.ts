import { randomUUID } from "crypto";
import type {
  CreateMeetingTopicDto,
  MeetingAvailabilityWindowDto,
  MeetingFieldConfigDto,
  MeetingTimeRangeDto,
  UpdateMeetingTopicDto,
  WeeklyDayScheduleDto,
} from "../dto/meetingTool.dto";
import type { BookMeetingDto } from "../dto/meeting.dto";
import {
  MEETING_FIELD_TYPE_VALUES,
  type MeetingFieldType,
} from "../models/meetingTool/meetingTool.interface";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function parsePositiveInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

function parseTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("timezone must be a non-empty string");
  }
  const tz = value.trim();
  if (!isValidIanaTimezone(tz)) {
    throw new Error("timezone must be a valid IANA timezone");
  }
  return tz;
}

function parseTimeHHmm(value: unknown, field: string): string {
  if (typeof value !== "string" || !TIME_RE.test(value.trim())) {
    throw new Error(`${field} must be HH:mm`);
  }
  return value.trim();
}

function parseBlackoutDate(value: unknown): string {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) {
    throw new Error("blackoutDates entries must be YYYY-MM-DD");
  }
  return value.trim();
}

/** Inclusive YYYY-MM-DD range for public availability queries (max 62 days). */
export function parseAvailabilityRangeQuery(
  fromRaw: unknown,
  toRaw: unknown,
): { fromYmd: string; toYmd: string } {
  if (typeof fromRaw !== "string" || !DATE_RE.test(fromRaw.trim())) {
    throw new Error("from must be YYYY-MM-DD");
  }
  if (typeof toRaw !== "string" || !DATE_RE.test(toRaw.trim())) {
    throw new Error("to must be YYYY-MM-DD");
  }
  const fromYmd = fromRaw.trim();
  const toYmd = toRaw.trim();
  if (fromYmd > toYmd) {
    throw new Error("from must be on or before to");
  }
  const fromMs = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const toMs = Date.parse(`${toYmd}T00:00:00.000Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    throw new Error("from and to must be valid dates");
  }
  const daySpan = Math.floor((toMs - fromMs) / 86_400_000) + 1;
  if (daySpan > 62) {
    throw new Error("Availability range must be at most 62 days");
  }
  return { fromYmd, toYmd };
}

function parseFieldType(value: unknown): MeetingFieldType {
  if (
    typeof value !== "string" ||
    !(MEETING_FIELD_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `field type must be one of: ${MEETING_FIELD_TYPE_VALUES.join(", ")}`,
    );
  }
  return value as MeetingFieldType;
}

function defaultLabelForType(type: MeetingFieldType): string {
  switch (type) {
    case "email":
      return "Email";
    case "firstName":
      return "First name";
    case "lastName":
      return "Last name";
    case "company":
      return "Company";
    case "phone":
      return "Phone";
    case "text":
      return "Text";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function parseFieldConfig(
  value: unknown,
  index: number,
): MeetingFieldConfigDto {
  if (!value || typeof value !== "object") {
    throw new Error(`fields[${index}] must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const type = parseFieldType(raw.type);
  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : defaultLabelForType(type);
  const required = parseBoolean(
    raw.required ?? false,
    `fields[${index}].required`,
  );
  const order =
    typeof raw.order === "number" && Number.isInteger(raw.order) && raw.order >= 0
      ? raw.order
      : index;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : randomUUID();
  const sendConfirmation =
    type === "email"
      ? parseBoolean(
          raw.sendConfirmation ?? false,
          `fields[${index}].sendConfirmation`,
        )
      : false;

  return { id, type, label, required, order, sendConfirmation };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function rangesOverlap(
  a: MeetingTimeRangeDto,
  b: MeetingTimeRangeDto,
): boolean {
  return (
    timeToMinutes(a.startTime) < timeToMinutes(b.endTime) &&
    timeToMinutes(b.startTime) < timeToMinutes(a.endTime)
  );
}

function parseTimeRange(
  value: unknown,
  path: string,
): MeetingTimeRangeDto {
  if (!value || typeof value !== "object") {
    throw new Error(`${path} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const startTime = parseTimeHHmm(raw.startTime, `${path}.startTime`);
  const endTime = parseTimeHHmm(raw.endTime, `${path}.endTime`);
  if (startTime >= endTime) {
    throw new Error(`${path}.endTime must be after startTime`);
  }
  return { startTime, endTime };
}

function parseAvailabilityWindow(
  value: unknown,
  path: string,
): MeetingAvailabilityWindowDto {
  const range = parseTimeRange(value, path);
  if (!value || typeof value !== "object") {
    throw new Error(`${path} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const capacity = parsePositiveInt(raw.capacity, `${path}.capacity`, 1, 500);
  return { ...range, capacity };
}

function isBreakInsideWindows(
  brk: MeetingTimeRangeDto,
  windows: MeetingAvailabilityWindowDto[],
): boolean {
  const bStart = timeToMinutes(brk.startTime);
  const bEnd = timeToMinutes(brk.endTime);
  const covered = new Set<number>();
  for (const w of windows) {
    const wStart = timeToMinutes(w.startTime);
    const wEnd = timeToMinutes(w.endTime);
    for (let m = wStart; m < wEnd; m++) covered.add(m);
  }
  for (let m = bStart; m < bEnd; m++) {
    if (!covered.has(m)) return false;
  }
  return true;
}

function parseWeeklyDaySchedule(
  value: unknown,
  index: number,
): WeeklyDayScheduleDto {
  if (!value || typeof value !== "object") {
    throw new Error(`weeklySchedule[${index}] must be an object`);
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.dayOfWeek !== "number" ||
    !Number.isInteger(raw.dayOfWeek) ||
    raw.dayOfWeek < 0 ||
    raw.dayOfWeek > 6
  ) {
    throw new Error(`weeklySchedule[${index}].dayOfWeek must be 0–6`);
  }
  const enabled = parseBoolean(
    raw.enabled ?? true,
    `weeklySchedule[${index}].enabled`,
  );
  if (!Array.isArray(raw.windows)) {
    throw new Error(`weeklySchedule[${index}].windows must be an array`);
  }
  if (!Array.isArray(raw.breaks)) {
    throw new Error(`weeklySchedule[${index}].breaks must be an array`);
  }

  const windows = raw.windows.map((w, i) =>
    parseAvailabilityWindow(w, `weeklySchedule[${index}].windows[${i}]`),
  );
  const breaks = raw.breaks.map((b, i) =>
    parseTimeRange(b, `weeklySchedule[${index}].breaks[${i}]`),
  );

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (rangesOverlap(windows[i]!, windows[j]!)) {
        throw new Error(
          `weeklySchedule[${index}].windows must not overlap`,
        );
      }
    }
  }

  for (let i = 0; i < breaks.length; i++) {
    for (let j = i + 1; j < breaks.length; j++) {
      if (rangesOverlap(breaks[i]!, breaks[j]!)) {
        throw new Error(
          `weeklySchedule[${index}].breaks must not overlap`,
        );
      }
    }
  }

  if (enabled && windows.length === 0 && breaks.length > 0) {
    throw new Error(
      `weeklySchedule[${index}].breaks require at least one window`,
    );
  }

  for (let i = 0; i < breaks.length; i++) {
    if (!isBreakInsideWindows(breaks[i]!, windows)) {
      throw new Error(
        `weeklySchedule[${index}].breaks[${i}] must fall within the day's windows`,
      );
    }
  }

  return {
    dayOfWeek: raw.dayOfWeek,
    enabled,
    windows,
    breaks,
  };
}

export function parseWeeklySchedule(
  value: unknown,
): WeeklyDayScheduleDto[] {
  if (!Array.isArray(value)) {
    throw new Error("weeklySchedule must be an array");
  }
  const days = value.map((d, i) => parseWeeklyDaySchedule(d, i));
  const seen = new Set<number>();
  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      throw new Error("weeklySchedule dayOfWeek values must be unique");
    }
    seen.add(day.dayOfWeek);
  }
  return days.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export function slugifyMeetingTopicName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error("name must produce a valid slug");
  }
  return slug;
}

export function parseCreateMeetingTopicDto(body: unknown): CreateMeetingTopicDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new Error("name must be a non-empty string");
  }
  return { name: raw.name.trim() };
}

export function parseUpdateMeetingTopicDto(
  body: unknown,
): UpdateMeetingTopicDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;
  const patch: UpdateMeetingTopicDto = {};

  if ("name" in raw) {
    if (typeof raw.name !== "string" || !raw.name.trim()) {
      throw new Error("name must be a non-empty string");
    }
    patch.name = raw.name.trim();
  }
  if ("enabled" in raw) {
    patch.enabled = parseBoolean(raw.enabled, "enabled");
  }
  if ("allowConflict" in raw) {
    patch.allowConflict = parseBoolean(raw.allowConflict, "allowConflict");
  }
  if ("timezone" in raw) {
    patch.timezone = parseTimezone(raw.timezone);
  }
  if ("slotDurationMinutes" in raw) {
    patch.slotDurationMinutes = parsePositiveInt(
      raw.slotDurationMinutes,
      "slotDurationMinutes",
      5,
      480,
    );
  }
  if ("bookingHorizonDays" in raw) {
    patch.bookingHorizonDays = parsePositiveInt(
      raw.bookingHorizonDays,
      "bookingHorizonDays",
      1,
      365,
    );
  }
  if ("fields" in raw) {
    if (!Array.isArray(raw.fields)) {
      throw new Error("fields must be an array");
    }
    const fields = raw.fields.map((f, i) => parseFieldConfig(f, i));
    const ids = new Set(fields.map((f) => f.id));
    if (ids.size !== fields.length) {
      throw new Error("field ids must be unique");
    }
    patch.fields = fields
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((f, i) => ({ ...f, order: i }));
  }
  if ("weeklySchedule" in raw) {
    patch.weeklySchedule = parseWeeklySchedule(raw.weeklySchedule);
  }
  if ("blackoutDates" in raw) {
    if (!Array.isArray(raw.blackoutDates)) {
      throw new Error("blackoutDates must be an array");
    }
    const dates = raw.blackoutDates.map(parseBlackoutDate);
    patch.blackoutDates = [...new Set(dates)].sort();
  }

  return patch;
}

export function parseBookMeetingDto(body: unknown): BookMeetingDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.sessionId !== "string" || !raw.sessionId.trim()) {
    throw new Error("sessionId is required");
  }
  if (typeof raw.meetingTopicId !== "string" || !raw.meetingTopicId.trim()) {
    throw new Error("meetingTopicId is required");
  }
  if (typeof raw.startsAt !== "string" || !raw.startsAt.trim()) {
    throw new Error("startsAt is required");
  }
  const startsAtDate = new Date(raw.startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    throw new Error("startsAt must be a valid ISO datetime");
  }
  if (!Array.isArray(raw.fieldValues)) {
    throw new Error("fieldValues must be an array");
  }

  const fieldValues: Array<{ fieldId: string; value: string }> = [];
  for (let i = 0; i < raw.fieldValues.length; i++) {
    const entry = raw.fieldValues[i];
    if (!entry || typeof entry !== "object") {
      throw new Error(`fieldValues[${i}] must be an object`);
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.fieldId !== "string" || !item.fieldId.trim()) {
      throw new Error(`fieldValues[${i}].fieldId is required`);
    }
    if (typeof item.value !== "string") {
      throw new Error(`fieldValues[${i}].value must be a string`);
    }
    fieldValues.push({
      fieldId: item.fieldId.trim(),
      value: item.value.trim(),
    });
  }

  return {
    sessionId: raw.sessionId.trim(),
    meetingTopicId: raw.meetingTopicId.trim(),
    startsAt: startsAtDate.toISOString(),
    fieldValues,
  };
}

export function validateFieldValueByType(
  type: MeetingFieldType,
  value: string,
  label: string,
  required: boolean,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new Error(`${label} is required`);
    }
    return "";
  }

  switch (type) {
    case "email":
      if (!EMAIL_RE.test(trimmed)) {
        throw new Error(`${label} must be a valid email`);
      }
      return trimmed.toLowerCase();
    case "phone": {
      const digits = trimmed.replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length < 7) {
        throw new Error(`${label} must be a valid phone number`);
      }
      return trimmed;
    }
    case "firstName":
    case "lastName":
    case "company":
    case "text":
      if (trimmed.length > 500) {
        throw new Error(`${label} must be at most 500 characters`);
      }
      return trimmed;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

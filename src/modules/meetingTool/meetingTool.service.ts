import { Types } from "mongoose";
import type {
  CreateMeetingTopicDto,
  EnabledMeetingTopicForAgent,
  MeetingAvailabilityDto,
  MeetingBookingPayloadDto,
  MeetingSlotDto,
  MeetingTopicListOutDto,
  MeetingTopicOutDto,
  UpdateMeetingTopicDto,
} from "../../dto/meetingTool.dto";
import { MeetingModel } from "../../models/meeting/meeting.model";
import type {
  MeetingAvailabilityWindow,
  MeetingTimeRange,
  MeetingTopicInterface,
  WeeklyDaySchedule,
} from "../../models/meetingTool/meetingTool.interface";
import {
  meetingTopicToolName,
  resolveWeeklySchedule,
} from "../../models/meetingTool/meetingTool.interface";
import { MeetingTopicModel } from "../../models/meetingTool/meetingTool.model";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { entitlementService } from "../entitlement/entitlement.service";
import { userService } from "../user/user.service";
import { slugifyMeetingTopicName } from "../../validation/meetingTool";

type TopicDoc = MeetingTopicInterface & { _id: Types.ObjectId };

type CandidateSlot = {
  startsAt: string;
  endsAt: string;
  capacity: number;
};

const DEFAULT_FIELDS = [
  {
    id: "email",
    type: "email" as const,
    label: "Email",
    required: true,
    order: 0,
  },
];

const DEFAULT_WEEKLY_SCHEDULE: WeeklyDaySchedule[] = [1, 2, 3, 4, 5].map(
  (dayOfWeek) => ({
    dayOfWeek,
    enabled: true,
    windows: [{ startTime: "09:00", endTime: "17:00", capacity: 1 }],
    breaks: [],
  }),
);

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function partsInTimeZone(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const dayOfWeekMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    dayOfWeek: dayOfWeekMap[weekday] ?? 0,
  };
}

export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(utcGuess);
  for (let i = 0; i < 3; i++) {
    const parts = partsInTimeZone(instant, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = desired - asUtc;
    if (diff === 0) break;
    instant = new Date(instant.getTime() + diff);
  }
  return instant;
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseHHmm(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

function timeToMinutes(value: string): number {
  const { hour, minute } = parseHHmm(value);
  return hour * 60 + minute;
}

function addDaysYmd(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/** Subtract break intervals from a window → contiguous open segments. */
export function subtractBreaksFromWindow(
  window: MeetingTimeRange,
  breaks: MeetingTimeRange[],
): MeetingTimeRange[] {
  let segments: MeetingTimeRange[] = [
    { startTime: window.startTime, endTime: window.endTime },
  ];
  const sortedBreaks = [...breaks].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  for (const brk of sortedBreaks) {
    const next: MeetingTimeRange[] = [];
    const bStart = timeToMinutes(brk.startTime);
    const bEnd = timeToMinutes(brk.endTime);
    for (const seg of segments) {
      const sStart = timeToMinutes(seg.startTime);
      const sEnd = timeToMinutes(seg.endTime);
      if (bEnd <= sStart || bStart >= sEnd) {
        next.push(seg);
        continue;
      }
      if (bStart > sStart) {
        next.push({ startTime: seg.startTime, endTime: brk.startTime });
      }
      if (bEnd < sEnd) {
        next.push({ startTime: brk.endTime, endTime: seg.endTime });
      }
    }
    segments = next.filter(
      (s) => timeToMinutes(s.startTime) < timeToMinutes(s.endTime),
    );
  }
  return segments;
}

function generateCandidateSlots(
  topic: Pick<
    MeetingTopicInterface,
    | "timezone"
    | "slotDurationMinutes"
    | "bookingHorizonDays"
    | "weeklySchedule"
    | "weeklyHours"
    | "blackoutDates"
  >,
  now: Date = new Date(),
  range?: { fromYmd: string; toYmd: string },
): CandidateSlot[] {
  const tz = topic.timezone || "UTC";
  const durationMs = topic.slotDurationMinutes * 60_000;
  const blackouts = new Set(topic.blackoutDates ?? []);
  const scheduleByDay = new Map<number, WeeklyDaySchedule>();
  for (const day of resolveWeeklySchedule(topic)) {
    scheduleByDay.set(day.dayOfWeek, day);
  }

  const nowParts = partsInTimeZone(now, tz);
  const horizon = Math.max(1, topic.bookingHorizonDays);
  const horizonEnd = addDaysYmd(
    nowParts.year,
    nowParts.month,
    nowParts.day,
    horizon - 1,
  );
  const horizonStartYmd = formatYmd(
    nowParts.year,
    nowParts.month,
    nowParts.day,
  );
  const horizonEndYmd = formatYmd(
    horizonEnd.year,
    horizonEnd.month,
    horizonEnd.day,
  );

  let fromYmd = horizonStartYmd;
  let toYmd = horizonEndYmd;
  if (range) {
    fromYmd = range.fromYmd > horizonStartYmd ? range.fromYmd : horizonStartYmd;
    toYmd = range.toYmd < horizonEndYmd ? range.toYmd : horizonEndYmd;
  }
  if (fromYmd > toYmd) return [];

  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return [];

  const slots: CandidateSlot[] = [];
  let cursor = { year: fy, month: fm, day: fd };
  const endKey = toYmd;

  while (formatYmd(cursor.year, cursor.month, cursor.day) <= endKey) {
    const ymd = formatYmd(cursor.year, cursor.month, cursor.day);
    if (!blackouts.has(ymd)) {
      const noonUtc = zonedWallTimeToUtc(
        cursor.year,
        cursor.month,
        cursor.day,
        12,
        0,
        tz,
      );
      const dow = partsInTimeZone(noonUtc, tz).dayOfWeek;
      const day = scheduleByDay.get(dow);
      if (day?.enabled && day.windows.length > 0) {
        for (const window of day.windows) {
          const openSegments = subtractBreaksFromWindow(window, day.breaks);
          for (const segment of openSegments) {
            let cursorMin = timeToMinutes(segment.startTime);
            const endMin = timeToMinutes(segment.endTime);
            while (cursorMin + topic.slotDurationMinutes <= endMin) {
              const h = Math.floor(cursorMin / 60);
              const m = cursorMin % 60;
              const startsAt = zonedWallTimeToUtc(
                cursor.year,
                cursor.month,
                cursor.day,
                h,
                m,
                tz,
              );
              if (startsAt.getTime() > now.getTime()) {
                const endsAt = new Date(startsAt.getTime() + durationMs);
                slots.push({
                  startsAt: startsAt.toISOString(),
                  endsAt: endsAt.toISOString(),
                  capacity: window.capacity,
                });
              }
              cursorMin += topic.slotDurationMinutes;
            }
          }
        }
      }
    }
    cursor = addDaysYmd(cursor.year, cursor.month, cursor.day, 1);
  }

  return slots;
}

function toTopicOutDto(doc: TopicDoc): MeetingTopicOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    name: doc.name,
    slug: doc.slug,
    toolName: meetingTopicToolName(doc.slug),
    enabled: doc.enabled,
    allowConflict: doc.allowConflict,
    timezone: doc.timezone,
    slotDurationMinutes: doc.slotDurationMinutes,
    bookingHorizonDays: doc.bookingHorizonDays,
    fields: [...doc.fields].sort((a, b) => a.order - b.order),
    weeklySchedule: resolveWeeklySchedule(doc),
    blackoutDates: doc.blackoutDates ?? [],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function slotKeyFor(
  meetingTopicId: Types.ObjectId | string,
  startsAt: Date,
): string {
  return `${meetingTopicId.toString()}:${startsAt.toISOString()}`;
}

export function seatKeyFor(slotKey: string, seatIndex: number): string {
  return `${slotKey}:${seatIndex}`;
}

class MeetingToolService {
  async listTopics(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<MeetingTopicListOutDto> {
    let planAllows = false;
    let maxMeetingTopics = 0;
    try {
      planAllows = await entitlementService.hasMeetingTool(userId, apiKeyId);
      const plan = await userService.getUserPlan(userId);
      maxMeetingTopics = plan?.maxMeetingTopics ?? 0;
    } catch {
      // Inactive / missing plan   still return topics for read/admin views.
    }
    const topics = await MeetingTopicModel.find({ apiKeyId })
      .sort({ name: 1 })
      .lean<TopicDoc[]>();

    return {
      topics: topics.map(toTopicOutDto),
      planAllows,
      maxMeetingTopics,
    };
  }

  async createTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    input: CreateMeetingTopicDto,
  ): Promise<MeetingTopicOutDto> {
    const canCreate = await entitlementService.canCreateMeetingTopic(
      userId,
      apiKeyId,
    );
    if (!canCreate) {
      const entitled = await entitlementService.hasMeetingTool(userId, apiKeyId);
      if (!entitled) {
        throw new Error("Your plan does not include the Meeting Tool");
      }
      throw new Error("Meeting topic limit reached for your plan");
    }

    const apiKey = await ApiKeyModel.findOne({ _id: apiKeyId });
    if (!apiKey) {
      throw new Error("API key not found");
    }

    const slug = slugifyMeetingTopicName(input.name);

    try {
      const created = await MeetingTopicModel.create({
        userId,
        apiKeyId,
        name: input.name.trim(),
        slug,
        enabled: false,
        allowConflict: false,
        timezone: "UTC",
        slotDurationMinutes: 30,
        bookingHorizonDays: 14,
        fields: DEFAULT_FIELDS,
        weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
        blackoutDates: [],
      });
      return toTopicOutDto(created.toObject() as TopicDoc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("A meeting topic with this name already exists");
      }
      throw error;
    }
  }

  async getTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
  ): Promise<MeetingTopicOutDto> {
    if (!Types.ObjectId.isValid(topicId)) {
      throw new Error("Meeting topic not found");
    }
    const doc = await MeetingTopicModel.findOne({
      _id: new Types.ObjectId(topicId),
      apiKeyId,
    }).lean<TopicDoc>();
    if (!doc) {
      throw new Error("Meeting topic not found");
    }
    return toTopicOutDto(doc);
  }

  async updateTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
    patch: UpdateMeetingTopicDto,
  ): Promise<MeetingTopicOutDto> {
    if (!Types.ObjectId.isValid(topicId)) {
      throw new Error("Meeting topic not found");
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      $set.name = patch.name;
      $set.slug = slugifyMeetingTopicName(patch.name);
    }
    if (patch.enabled !== undefined) {
      if (patch.enabled === true) {
        await entitlementService.assertMeetingToolEntitled(userId, apiKeyId);
      }
      $set.enabled = patch.enabled;
    }
    if (patch.allowConflict !== undefined)
      $set.allowConflict = patch.allowConflict;
    if (patch.timezone !== undefined) $set.timezone = patch.timezone;
    if (patch.slotDurationMinutes !== undefined)
      $set.slotDurationMinutes = patch.slotDurationMinutes;
    if (patch.bookingHorizonDays !== undefined)
      $set.bookingHorizonDays = patch.bookingHorizonDays;
    if (patch.fields !== undefined) $set.fields = patch.fields;
    if (patch.weeklySchedule !== undefined) {
      $set.weeklySchedule = patch.weeklySchedule;
      $unset.weeklyHours = "";
    }
    if (patch.blackoutDates !== undefined)
      $set.blackoutDates = patch.blackoutDates;

    try {
      const updateOps: Record<string, unknown> = { $set };
      if (Object.keys($unset).length > 0) updateOps.$unset = $unset;

      const updated = await MeetingTopicModel.findOneAndUpdate(
        { _id: new Types.ObjectId(topicId), apiKeyId },
        updateOps,
        { new: true },
      ).lean<TopicDoc>();

      if (!updated) {
        throw new Error("Meeting topic not found");
      }
      return toTopicOutDto(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("A meeting topic with this name already exists");
      }
      throw error;
    }
  }

  async deleteTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(topicId)) {
      throw new Error("Meeting topic not found");
    }
    const topicObjectId = new Types.ObjectId(topicId);
    const existing = await MeetingTopicModel.findOne({
      _id: topicObjectId,
      apiKeyId,
    })
      .select("_id")
      .lean();
    if (!existing) {
      throw new Error("Meeting topic not found");
    }

    await MeetingModel.deleteMany({
      meetingTopicId: topicObjectId,
      apiKeyId,
    });

    await MeetingTopicModel.findOneAndDelete({
      _id: topicObjectId,
      userId,
      apiKeyId,
    });
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await MeetingTopicModel.deleteMany({ apiKeyId });
  }

  async isEffectivelyEnabled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    try {
      const topics = await this.listEnabledTopicsForAgent(userId, apiKeyId);
      return topics.length > 0;
    } catch {
      return false;
    }
  }

  async listEnabledTopicsForAgent(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<EnabledMeetingTopicForAgent[]> {
    const planAllows = await entitlementService.hasMeetingTool(userId, apiKeyId);
    if (!planAllows) return [];

    const docs = await MeetingTopicModel.find({
      apiKeyId,
      enabled: true,
    })
      .select("name slug")
      .lean<Array<{ _id: Types.ObjectId; name: string; slug: string }>>();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      slug: doc.slug,
      toolName: meetingTopicToolName(doc.slug),
    }));
  }

  async findEnabledTopicByToolName(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    toolName: string,
  ): Promise<EnabledMeetingTopicForAgent | null> {
    const topics = await this.listEnabledTopicsForAgent(userId, apiKeyId);
    const key = toolName.trim().toLowerCase().replace(/-/g, "_");
    return (
      topics.find(
        (t) =>
          t.toolName.toLowerCase().replace(/-/g, "_") === key ||
          `book_meeting_${t.slug}`.toLowerCase().replace(/-/g, "_") === key,
      ) ?? null
    );
  }

  async assertTopicEffectivelyEnabled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
  ): Promise<TopicDoc> {
    await entitlementService.assertMeetingToolEntitled(userId, apiKeyId);
    if (!Types.ObjectId.isValid(topicId)) {
      throw new Error("Meeting topic not found");
    }
    const topic = await MeetingTopicModel.findOne({
      _id: new Types.ObjectId(topicId),
      apiKeyId,
    }).lean<TopicDoc>();
    if (!topic) {
      throw new Error("Meeting topic not found");
    }
    if (!topic.enabled) {
      throw new Error("Meeting Tool is disabled for this project");
    }
    return topic;
  }

  async buildAvailability(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
    topic?: TopicDoc,
    range?: { fromYmd: string; toYmd: string },
  ): Promise<MeetingAvailabilityDto> {
    const cfg =
      topic ??
      (await this.assertTopicEffectivelyEnabled(userId, apiKeyId, topicId));
    const candidates = generateCandidateSlots(cfg, new Date(), range);

    if (candidates.length === 0) {
      return {
        meetingTopicId: cfg._id.toString(),
        timezone: cfg.timezone,
        slotDurationMinutes: cfg.slotDurationMinutes,
        allowConflict: cfg.allowConflict,
        availableSlots: [],
        unavailableSlots: [],
      };
    }

    const rangeStart = new Date(candidates[0]!.startsAt);
    const rangeEnd = new Date(candidates[candidates.length - 1]!.endsAt);

    const booked = await MeetingModel.find({
      meetingTopicId: cfg._id,
      status: "scheduled",
      startsAt: { $gte: rangeStart, $lte: rangeEnd },
    })
      .select("startsAt")
      .lean<Array<{ startsAt: Date }>>();

    const bookedCounts = new Map<string, number>();
    for (const m of booked) {
      const key = new Date(m.startsAt).toISOString();
      bookedCounts.set(key, (bookedCounts.get(key) ?? 0) + 1);
    }

    const availableSlots: MeetingSlotDto[] = [];
    const unavailableSlots: MeetingSlotDto[] = [];
    for (const slot of candidates) {
      const bookedCount = bookedCounts.get(slot.startsAt) ?? 0;
      const remainingCapacity = Math.max(0, slot.capacity - bookedCount);
      const enriched: MeetingSlotDto = {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        capacity: slot.capacity,
        bookedCount,
        remainingCapacity,
      };
      if (remainingCapacity > 0) {
        availableSlots.push(enriched);
      } else {
        unavailableSlots.push(enriched);
      }
    }

    return {
      meetingTopicId: cfg._id.toString(),
      timezone: cfg.timezone,
      slotDurationMinutes: cfg.slotDurationMinutes,
      allowConflict: cfg.allowConflict,
      availableSlots,
      unavailableSlots,
    };
  }

  async buildBookingPayload(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    topicId: string,
  ): Promise<MeetingBookingPayloadDto> {
    const topic = await this.assertTopicEffectivelyEnabled(
      userId,
      apiKeyId,
      topicId,
    );
    const fields = [...topic.fields]
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        required: f.required,
        order: f.order,
      }));

    return {
      action: "create_meeting",
      meetingTopicId: topic._id.toString(),
      topicName: topic.name,
      timezone: topic.timezone,
      slotDurationMinutes: topic.slotDurationMinutes,
      bookingHorizonDays: topic.bookingHorizonDays,
      allowConflict: topic.allowConflict,
      fields,
      weeklySchedule: resolveWeeklySchedule(topic),
      blackoutDates: topic.blackoutDates ?? [],
    };
  }

  findConfiguredSlot(
    topic: MeetingTopicInterface,
    startsAtIso: string,
  ): CandidateSlot | null {
    const candidates = generateCandidateSlots(topic);
    return candidates.find((s) => s.startsAt === startsAtIso) ?? null;
  }

  isConfiguredSlot(topic: MeetingTopicInterface, startsAtIso: string): boolean {
    return this.findConfiguredSlot(topic, startsAtIso) !== null;
  }
}

export const meetingToolService = new MeetingToolService();

// Re-export for tests / booking helpers
export type { MeetingAvailabilityWindow };

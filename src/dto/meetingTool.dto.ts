import type {
  MeetingAvailabilityWindow,
  MeetingFieldConfig,
  MeetingFieldType,
  MeetingTimeRange,
  WeeklyDaySchedule,
  WeeklyHourRule,
} from "../models/meetingTool/meetingTool.interface";

export type MeetingFieldConfigDto = MeetingFieldConfig;
export type MeetingTimeRangeDto = MeetingTimeRange;
export type MeetingAvailabilityWindowDto = MeetingAvailabilityWindow;
export type WeeklyDayScheduleDto = WeeklyDaySchedule;
/** @deprecated Prefer WeeklyDayScheduleDto */
export type WeeklyHourRuleDto = WeeklyHourRule;

export interface MeetingTopicOutDto {
  id: string;
  apiKeyId: string;
  name: string;
  slug: string;
  toolName: string;
  enabled: boolean;
  allowConflict: boolean;
  timezone: string;
  slotDurationMinutes: number;
  bookingHorizonDays: number;
  fields: MeetingFieldConfigDto[];
  weeklySchedule: WeeklyDayScheduleDto[];
  blackoutDates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingTopicListOutDto {
  topics: MeetingTopicOutDto[];
  planAllows: boolean;
  maxMeetingTopics: number;
}

export interface CreateMeetingTopicDto {
  name: string;
}

export interface UpdateMeetingTopicDto {
  name?: string;
  enabled?: boolean;
  allowConflict?: boolean;
  timezone?: string;
  slotDurationMinutes?: number;
  bookingHorizonDays?: number;
  fields?: MeetingFieldConfigDto[];
  weeklySchedule?: WeeklyDayScheduleDto[];
  blackoutDates?: string[];
}

export interface MeetingSlotDto {
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  remainingCapacity: number;
}

export interface MeetingAvailabilityDto {
  meetingTopicId: string;
  timezone: string;
  slotDurationMinutes: number;
  allowConflict: boolean;
  availableSlots: MeetingSlotDto[];
  unavailableSlots: MeetingSlotDto[];
}

export interface MeetingBookingFieldDto {
  id: string;
  type: MeetingFieldType;
  label: string;
  required: boolean;
  order: number;
}

export interface MeetingBookingPayloadDto {
  action: "create_meeting";
  meetingTopicId: string;
  topicName: string;
  timezone: string;
  slotDurationMinutes: number;
  bookingHorizonDays: number;
  allowConflict: boolean;
  fields: MeetingBookingFieldDto[];
  weeklySchedule: WeeklyDayScheduleDto[];
  blackoutDates: string[];
}

/** Agent-facing enabled topic summary for tool registration. */
export interface EnabledMeetingTopicForAgent {
  id: string;
  name: string;
  slug: string;
  toolName: string;
}

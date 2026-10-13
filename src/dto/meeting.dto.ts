import type { MeetingFieldType } from "../models/meetingTool/meetingTool.interface";
import type { MeetingStatus } from "../models/meeting/meeting.interface";
import type {
  MeetingAvailabilityDto,
  MeetingSlotDto,
} from "./meetingTool.dto";

export interface MeetingFieldValueDto {
  fieldId: string;
  type: MeetingFieldType;
  label: string;
  value: string;
}

export interface MeetingOutDto {
  id: string;
  apiKeyId: string;
  meetingTopicId: string;
  topicName: string | null;
  startsAt: string;
  timezone: string;
  durationMinutes: number;
  fieldValues: MeetingFieldValueDto[];
  chatSessionId: string | null;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Lean facts for the agent prompt   no visitor field values. */
export interface SessionMeetingFactDto {
  meetingTopicId: string;
  topicName: string;
  startsAt: string;
  timezone: string;
  durationMinutes: number;
}

export interface BookMeetingDto {
  sessionId: string;
  meetingTopicId: string;
  startsAt: string;
  fieldValues: Array<{ fieldId: string; value: string }>;
}

export interface BookMeetingSuccessDto {
  meetingId: string;
  meetingTopicId: string;
  startsAt: string;
  timezone: string;
  status: MeetingStatus;
  durationMinutes: number;
}

export interface BookMeetingConflictDto {
  code: "SLOT_UNAVAILABLE";
  availability: MeetingAvailabilityDto;
}

export type BookMeetingResultDto =
  | BookMeetingSuccessDto
  | BookMeetingConflictDto;

export type { MeetingSlotDto, MeetingAvailabilityDto };

import { Types } from "mongoose";
import type { MeetingFieldType } from "../meetingTool/meetingTool.interface";

export const MEETING_STATUS_VALUES = [
  "scheduled",
  "cancelled",
  "completed",
] as const;

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export interface MeetingFieldValue {
  fieldId: string;
  type: MeetingFieldType;
  label: string;
  value: string;
}

export interface MeetingInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  meetingTopicId: Types.ObjectId;
  startsAt: Date;
  /** Set on all new bookings; legacy docs may omit and use startsAt + durationMinutes. */
  endsAt?: Date | null;
  timezone: string;
  durationMinutes: number;
  fieldValues: MeetingFieldValue[];
  chatSessionId?: Types.ObjectId | null;
  status: MeetingStatus;
  /** Exact period identity: `${meetingTopicId}:${startsAt.toISOString()}` */
  slotKey?: string | null;
  /**
   * Race-resistant seat claim: `${slotKey}:${seatIndex}` where seatIndex ∈ [0, capacity).
   * Present only while status is scheduled.
   */
  seatKey?: string | null;
  /**
   * @deprecated Prefer seatKey. Kept for legacy documents.
   * Format: `${meetingTopicId}:${startsAt.toISOString()}`
   */
  conflictKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

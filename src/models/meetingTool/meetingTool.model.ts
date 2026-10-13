import { Schema, model } from "mongoose";
import {
  MEETING_FIELD_TYPE_VALUES,
  type MeetingTopicInterface,
} from "./meetingTool.interface";

const meetingFieldSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: MEETING_FIELD_TYPE_VALUES,
      required: true,
    },
    label: { type: String, required: true, trim: true },
    required: { type: Boolean, required: true, default: false },
    order: { type: Number, required: true, min: 0 },
    sendConfirmation: { type: Boolean, required: false, default: false },
  },
  { _id: false },
);

const meetingTimeRangeSchema = new Schema(
  {
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const meetingAvailabilityWindowSchema = new Schema(
  {
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1, max: 500, default: 1 },
  },
  { _id: false },
);

const weeklyDayScheduleSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    enabled: { type: Boolean, required: true, default: true },
    windows: {
      type: [meetingAvailabilityWindowSchema],
      required: true,
      default: [],
    },
    breaks: {
      type: [meetingTimeRangeSchema],
      required: true,
      default: [],
    },
  },
  { _id: false },
);

/** @deprecated Legacy flat hours for migration reads. */
const weeklyHourSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const meetingTopicSchema = new Schema<MeetingTopicInterface>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    allowConflict: {
      type: Boolean,
      required: true,
      default: false,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },
    slotDurationMinutes: {
      type: Number,
      required: true,
      min: 5,
      max: 480,
      default: 30,
    },
    bookingHorizonDays: {
      type: Number,
      required: true,
      min: 1,
      max: 365,
      default: 14,
    },
    fields: {
      type: [meetingFieldSchema],
      required: true,
      default: [],
    },
    weeklySchedule: {
      type: [weeklyDayScheduleSchema],
      required: true,
      default: [],
    },
    weeklyHours: {
      type: [weeklyHourSchema],
      required: false,
      default: undefined,
    },
    blackoutDates: {
      type: [String],
      required: true,
      default: [],
    },
  },
  { timestamps: true },
);

meetingTopicSchema.index({ apiKeyId: 1, slug: 1 }, { unique: true });
meetingTopicSchema.index({ userId: 1, apiKeyId: 1 });

export const MeetingTopicModel = model<MeetingTopicInterface>(
  "MeetingTopic",
  meetingTopicSchema,
);

/** @deprecated Use MeetingTopicModel */
export const MeetingToolConfigModel = MeetingTopicModel;

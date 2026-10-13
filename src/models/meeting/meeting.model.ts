import { Schema, model } from "mongoose";
import { MEETING_FIELD_TYPE_VALUES } from "../meetingTool/meetingTool.interface";
import {
  MEETING_STATUS_VALUES,
  type MeetingInterface,
} from "./meeting.interface";

const meetingFieldValueSchema = new Schema(
  {
    fieldId: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: MEETING_FIELD_TYPE_VALUES,
      required: true,
    },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const meetingSchema = new Schema<MeetingInterface>(
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
      index: true,
    },
    meetingTopicId: {
      type: Schema.Types.ObjectId,
      ref: "MeetingTopic",
      required: true,
      index: true,
    },
    startsAt: {
      type: Date,
      required: true,
      index: true,
    },
    endsAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 5,
    },
    fieldValues: {
      type: [meetingFieldValueSchema],
      required: true,
      default: [],
    },
    chatSessionId: {
      type: Schema.Types.ObjectId,
      ref: "ChatSession",
      required: false,
      default: null,
    },
    status: {
      type: String,
      enum: MEETING_STATUS_VALUES,
      required: true,
      default: "scheduled",
      index: true,
    },
    slotKey: {
      type: String,
      required: false,
      default: null,
      index: true,
    },
    seatKey: {
      type: String,
      required: false,
      default: null,
    },
    conflictKey: {
      type: String,
      required: false,
      default: null,
    },
  },
  { timestamps: true },
);

meetingSchema.index({ userId: 1, apiKeyId: 1, startsAt: 1 });
meetingSchema.index({ chatSessionId: 1, status: 1, startsAt: 1 });
meetingSchema.index({ meetingTopicId: 1, startsAt: 1 });
meetingSchema.index({ meetingTopicId: 1, slotKey: 1, status: 1 });
meetingSchema.index(
  { seatKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      seatKey: { $type: "string" },
      status: "scheduled",
    },
  },
);
meetingSchema.index(
  { conflictKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      conflictKey: { $type: "string" },
      status: "scheduled",
    },
  },
);

export const MeetingModel = model<MeetingInterface>("Meeting", meetingSchema);

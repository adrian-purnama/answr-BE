import { Types } from "mongoose";
import type {
  BookMeetingDto,
  BookMeetingResultDto,
  MeetingOutDto,
  SessionMeetingFactDto,
} from "../../dto/meeting.dto";
import { logger } from "../../logger/logger";
import { MeetingModel } from "../../models/meeting/meeting.model";
import type { MeetingInterface } from "../../models/meeting/meeting.interface";
import type { MeetingFieldConfig } from "../../models/meetingTool/meetingTool.interface";
import { MeetingTopicModel } from "../../models/meetingTool/meetingTool.model";
import { UserModel } from "../../models/user/user.model";
import { normalizeEmail } from "../../utils/email";
import { validateFieldValueByType } from "../../validation/meetingTool";
import { mailer } from "../mail/mail.service";
import { widgetService } from "../widget/widget.service";
import { toolGuardService } from "../toolGuard/toolGuard.service";
import {
  meetingToolService,
  seatKeyFor,
  slotKeyFor,
} from "./meetingTool.service";

type MeetingDoc = MeetingInterface & { _id: Types.ObjectId };

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function meetingEndsAt(doc: {
  startsAt: Date;
  endsAt?: Date | null;
  durationMinutes: number;
}): Date {
  if (doc.endsAt) return new Date(doc.endsAt);
  return new Date(
    new Date(doc.startsAt).getTime() + doc.durationMinutes * 60_000,
  );
}

function toMeetingOutDto(
  doc: MeetingDoc,
  topicName: string | null,
): MeetingOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    meetingTopicId: doc.meetingTopicId.toString(),
    topicName,
    startsAt: doc.startsAt.toISOString(),
    timezone: doc.timezone,
    durationMinutes: doc.durationMinutes,
    fieldValues: doc.fieldValues.map((f) => ({
      fieldId: f.fieldId,
      type: f.type,
      label: f.label,
      value: f.value,
    })),
    chatSessionId: doc.chatSessionId ? doc.chatSessionId.toString() : null,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function sendBookingConfirmation(input: {
  userId: Types.ObjectId;
  topicName: string;
  timezone: string;
  startsAt: Date;
  durationMinutes: number;
  fields: MeetingFieldConfig[];
  fieldValues: Array<{ fieldId: string; label: string; value: string }>;
}): Promise<void> {
  const confirmFields = input.fields.filter(
    (f) => f.type === "email" && f.sendConfirmation,
  );
  if (confirmFields.length === 0) return;

  const visitorEmails = confirmFields.map((f) =>
    normalizeEmail(input.fieldValues.find((v) => v.fieldId === f.id)?.value),
  );
  const owner = await UserModel.findById(input.userId)
    .select("email")
    .lean<{ email?: string }>();
  const recipients = [
    ...new Set(
      [...visitorEmails, normalizeEmail(owner?.email)].filter(
        (email): email is string => email != null,
      ),
    ),
  ];
  if (recipients.length === 0) return;

  await mailer.sendMeetingBookingConfirmation(recipients, {
    topicName: input.topicName,
    startsAt: input.startsAt.toISOString(),
    timezone: input.timezone,
    durationMinutes: input.durationMinutes,
    fieldValues: input.fieldValues.map((f) => ({
      label: f.label,
      value: f.value,
    })),
  });
}

function monthRangeContainingIso(
  startsAtIso: string,
  timeZone: string,
): { fromYmd: string; toYmd: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(startsAtIso));
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  if (!y || !m) {
    const day = startsAtIso.slice(0, 10);
    return { fromYmd: day, toYmd: day };
  }
  const fromYmd = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const toYmd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { fromYmd, toYmd };
}

class MeetingService {
  async listForOwner(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    range?: { fromYmd: string; toYmd: string },
  ): Promise<MeetingOutDto[]> {
    const filter: {
      apiKeyId: Types.ObjectId;
      status: { $in: ("scheduled" | "completed")[] };
      startsAt?: { $gte: Date; $lt: Date };
    } = {
      apiKeyId,
      status: { $in: ["scheduled", "completed"] },
    };
    if (range) {
      const fromMs = Date.parse(`${range.fromYmd}T00:00:00.000Z`);
      const toMs = Date.parse(`${range.toYmd}T00:00:00.000Z`);
      filter.startsAt = {
        $gte: new Date(fromMs),
        $lt: new Date(toMs + 86_400_000),
      };
    }

    const docs = await MeetingModel.find(filter)
      .sort({ startsAt: 1 })
      .limit(200)
      .lean<MeetingDoc[]>();

    const topicIds = [
      ...new Set(docs.map((d) => d.meetingTopicId.toString())),
    ].filter((id) => Types.ObjectId.isValid(id));

    const topics =
      topicIds.length > 0
        ? await MeetingTopicModel.find({
            _id: { $in: topicIds.map((id) => new Types.ObjectId(id)) },
          })
            .select("name")
            .lean<Array<{ _id: Types.ObjectId; name: string }>>()
        : [];
    const nameById = new Map(
      topics.map((t) => [t._id.toString(), t.name] as const),
    );

    return docs.map((doc) =>
      toMeetingOutDto(
        doc,
        nameById.get(doc.meetingTopicId.toString()) ?? null,
      ),
    );
  }

  async listScheduledForSession(
    chatSessionId: Types.ObjectId,
  ): Promise<SessionMeetingFactDto[]> {
    const docs = await MeetingModel.find({
      chatSessionId,
      status: "scheduled",
    })
      .sort({ startsAt: 1 })
      .limit(10)
      .lean<MeetingDoc[]>();
    if (docs.length === 0) return [];

    const topicIds = [
      ...new Set(docs.map((d) => d.meetingTopicId.toString())),
    ].filter((id) => Types.ObjectId.isValid(id));
    const topics =
      topicIds.length > 0
        ? await MeetingTopicModel.find({
            _id: { $in: topicIds.map((id) => new Types.ObjectId(id)) },
          })
            .select("name")
            .lean<Array<{ _id: Types.ObjectId; name: string }>>()
        : [];
    const nameById = new Map(
      topics.map((t) => [t._id.toString(), t.name] as const),
    );

    return docs.map((doc) => ({
      meetingTopicId: doc.meetingTopicId.toString(),
      topicName: nameById.get(doc.meetingTopicId.toString()) ?? "Meeting",
      startsAt: doc.startsAt.toISOString(),
      timezone: doc.timezone,
      durationMinutes: doc.durationMinutes,
    }));
  }

  async cancelForOwner(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    meetingId: string,
  ): Promise<MeetingOutDto> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new Error("Meeting not found");
    }
    const updated = await MeetingModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(meetingId),
        apiKeyId,
        status: "scheduled",
      },
      {
        $set: { status: "cancelled" },
        $unset: { conflictKey: "", seatKey: "" },
      },
      { new: true },
    ).lean<MeetingDoc>();

    if (!updated) {
      throw new Error("Meeting not found");
    }

    const topic = await MeetingTopicModel.findById(updated.meetingTopicId)
      .select("name")
      .lean<{ name?: string }>();
    return toMeetingOutDto(updated, topic?.name ?? null);
  }

  async bookForVisitor(
    publicKey: string,
    input: BookMeetingDto,
  ): Promise<BookMeetingResultDto> {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      input.sessionId,
    );

    const topic = await meetingToolService.assertTopicEffectivelyEnabled(
      session.userId,
      session.apiKeyId,
      input.meetingTopicId,
    );

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new Error("startsAt must be a valid ISO datetime");
    }
    const startsAtIso = startsAt.toISOString();

    const configured = meetingToolService.findConfiguredSlot(topic, startsAtIso);
    if (!configured) {
      throw new Error(
        "Selected date/time is not within configured availability",
      );
    }

    const endsAt = new Date(configured.endsAt);
    const durationMinutes = Math.max(
      5,
      Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
    );
    const capacity = configured.capacity;
    const slotKey = slotKeyFor(topic._id, startsAt);

    const valueByFieldId = new Map(
      input.fieldValues.map((f) => [f.fieldId, f.value]),
    );
    const fieldValues = [...topic.fields]
      .sort((a, b) => a.order - b.order)
      .map((field) => {
        const raw = valueByFieldId.get(field.id) ?? "";
        const value = validateFieldValueByType(
          field.type,
          raw,
          field.label,
          field.required,
        );
        return {
          fieldId: field.id,
          type: field.type,
          label: field.label,
          value,
        };
      });

    const unavailableResult = async (): Promise<BookMeetingResultDto> => {
      const availability = await meetingToolService.buildAvailability(
        session.userId,
        session.apiKeyId,
        topic._id.toString(),
        topic,
        monthRangeContainingIso(startsAtIso, topic.timezone),
      );
      return { code: "SLOT_UNAVAILABLE", availability };
    };

    if (!topic.allowConflict) {
      const candidates = await MeetingModel.find({
        meetingTopicId: topic._id,
        status: "scheduled",
        startsAt: { $lt: endsAt },
      })
        .select("startsAt endsAt durationMinutes")
        .lean<
          Array<{
            startsAt: Date;
            endsAt?: Date;
            durationMinutes: number;
          }>
        >();

      // Strict exclusivity across different periods: interval overlap [startsAt, endsAt)
      const overlapsDifferentPeriod = candidates.some((m) => {
        if (new Date(m.startsAt).toISOString() === startsAtIso) return false;
        const otherEnd = meetingEndsAt(m);
        return (
          new Date(m.startsAt).getTime() < endsAt.getTime() &&
          otherEnd.getTime() > startsAt.getTime()
        );
      });

      if (overlapsDifferentPeriod) {
        return unavailableResult();
      }
    }

    const existingForSlot = await MeetingModel.find({
      meetingTopicId: topic._id,
      status: "scheduled",
      startsAt,
    })
      .select("seatKey")
      .lean<Array<{ seatKey?: string | null }>>();

    if (existingForSlot.length >= capacity) {
      return unavailableResult();
    }

    const usedSeats = new Set<number>();
    for (const m of existingForSlot) {
      if (typeof m.seatKey === "string") {
        const parts = m.seatKey.split(":");
        const seatRaw = parts[parts.length - 1];
        const seat = Number(seatRaw);
        if (Number.isInteger(seat) && seat >= 0) usedSeats.add(seat);
      }
    }

    const freeSeats: number[] = [];
    for (let i = 0; i < capacity; i++) {
      if (!usedSeats.has(i)) freeSeats.push(i);
    }
    if (freeSeats.length === 0) {
      return unavailableResult();
    }

    const writeKey = `meeting_book:${session._id.toString()}:${topic._id.toString()}:${startsAtIso}`;
    if (!toolGuardService.claimWrite(writeKey)) {
      return unavailableResult();
    }

    for (const seatIndex of freeSeats) {
      try {
        const doc = await MeetingModel.create({
          userId: session.userId,
          apiKeyId: session.apiKeyId,
          meetingTopicId: topic._id,
          startsAt,
          endsAt,
          timezone: topic.timezone,
          durationMinutes,
          fieldValues,
          chatSessionId: session._id,
          status: "scheduled",
          slotKey,
          seatKey: seatKeyFor(slotKey, seatIndex),
        });

        void sendBookingConfirmation({
          userId: session.userId,
          topicName: topic.name,
          timezone: topic.timezone,
          startsAt: doc.startsAt,
          durationMinutes: doc.durationMinutes,
          fields: topic.fields,
          fieldValues,
        }).catch((error) => {
          logger.error(
            error instanceof Error ? error.message : String(error),
            "modules/meetingTool/meeting.service.ts",
            "bookForVisitor.sendBookingConfirmation",
          );
        });

        return {
          meetingId: doc._id.toString(),
          meetingTopicId: topic._id.toString(),
          startsAt: doc.startsAt.toISOString(),
          timezone: doc.timezone,
          status: doc.status,
          durationMinutes: doc.durationMinutes,
        };
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          continue;
        }
        throw error;
      }
    }

    return unavailableResult();
  }

  async getPublicAvailability(
    publicKey: string,
    sessionId: string,
    meetingTopicId: string,
    range?: { fromYmd: string; toYmd: string },
  ): Promise<
    Awaited<ReturnType<typeof meetingToolService.buildAvailability>>
  > {
    const session = await widgetService.assertPublicSessionCanChat(
      publicKey,
      sessionId,
    );
    return meetingToolService.buildAvailability(
      session.userId,
      session.apiKeyId,
      meetingTopicId,
      undefined,
      range,
    );
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await MeetingModel.deleteMany({ apiKeyId });
  }
}

export const meetingService = new MeetingService();

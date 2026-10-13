import mongoose, { Types } from "mongoose";
import type {
  AddPlanPeriodsDto,
  AddPlanPeriodsResultOutDto,
  AdjustPeriodTokensDto,
  CurrentPeriodQuotaOutDto,
  DeepseekTokenAdjustmentOutDto,
  PlanPeriodGapOutDto,
  PlanPeriodInputDto,
  PlanPeriodsPreviewOutDto,
  UserPlanPeriodOutDto,
  UserPlanTimelineOutDto,
} from "../../dto/userPlanPeriod.dto";
import { countQuotaWindows, getQuotaWindow } from "../../llm/deepseek/getQuotaWindow";
import { usedInWindow } from "../../llm/deepseek/deepseekQuotaHelpers";
import { logger } from "../../logger/logger";
import { PlanModel } from "../../models/plan/plan.model";
import type { PlanInterface } from "../../models/plan/plan.interface";
import { UserModel } from "../../models/user/user.model";
import type {
  DeepseekPeriodUsage,
  DeepseekTokenAdjustment,
} from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { isNeverUntil } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { UserPlanPeriodModel } from "../../models/userPlanPeriod/userPlanPeriod.model";
import { addCalendarMonths, backdateFloor } from "../../utils/calendarMonth";
import { syncApiKeysToPlanLimit } from "../user/syncApiKeysToPlanLimit";
import {
  isDuplicateKeyError,
  PlanPeriodConflictError,
  toConflictPayload,
} from "./planPeriodConflict.error";
import {
  assertValidRange,
  computeGaps,
  findOverlappingPeriod,
  type PeriodRange,
} from "./planPeriod.overlap";

const logSource = "modules/userPlanPeriod/userPlanPeriod.service.ts";

const PLAN_SELECT =
  "name slug accentColor maxApiKeys maxRequestsPerMinute maxArticles maxTopicsPerArticle maxImagesPerTopic maxCharactersPerTopic maxSnippets maxImagesPerSnippet maxCharactersPerSnippet maxGuidances maxCharactersPerGuidance maxLiveAgents liveAgent meetingTool leadCapture whatsApp maxMeetingTopics batchTestGroupAmount questionsPerBatchTestGroup analyticsLookbackDays deepseekQuotaPerPeriod quotaWindowDays isDefaultPlan";

export type PeriodQuotaSnapshot = {
  deepseekQuotaPerPeriod: number;
  quotaWindowDays: number | null;
};

type PeriodDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  effectiveDate: Date;
  untilDate: Date;
  source: "manual" | "default_sync";
  createdBy?: Types.ObjectId | null;
  deepseekQuotaPerPeriod?: number;
  quotaWindowDays?: number | null;
  deepseekUsage?: DeepseekPeriodUsage;
  deepseekTokenAdjustments?: DeepseekTokenAdjustment[];
  createdAt?: Date;
};

type PlanNameMap = Map<string, string>;

const fillingUsers = new Set<string>();

/** Serialize plan mutations per user in-process (planVersion covers multi-instance). */
const userLockTails = new Map<string, Promise<unknown>>();

async function withUserPlanLock<T>(
  userId: Types.ObjectId,
  fn: () => Promise<T>,
): Promise<T> {
  const key = userId.toString();
  const previous = userLockTails.get(key) ?? Promise.resolve();
  const run = previous.then(
    () => fn(),
    () => fn(),
  );
  userLockTails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function sortByEffective(periods: PeriodDoc[]): PeriodDoc[] {
  return [...periods].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
  );
}

function containingNow(periods: PeriodDoc[], now: Date): PeriodDoc | null {
  const t = now.getTime();
  for (const p of periods) {
    if (p.effectiveDate.getTime() <= t && t < p.untilDate.getTime()) {
      return p;
    }
  }
  return null;
}

async function loadPlanNames(planIds: Types.ObjectId[]): Promise<PlanNameMap> {
  const unique = [...new Set(planIds.map((id) => id.toString()))];
  if (unique.length === 0) return new Map();
  const plans = await PlanModel.find({
    _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
  })
    .select("name")
    .lean<Array<{ _id: Types.ObjectId; name: string }>>();
  return new Map(plans.map((p) => [p._id.toString(), p.name]));
}

function truncQuota(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.trunc(value);
}

function normalizeWindowDays(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.trunc(value);
  }
  return null;
}

function toAdjustmentOutDto(
  entry: DeepseekTokenAdjustment,
): DeepseekTokenAdjustmentOutDto {
  return {
    requestedAmount: entry.requestedAmount,
    appliedAmount: entry.appliedAmount,
    reason: entry.reason,
    source: entry.source,
    invoiceId: entry.invoiceId?.toString() ?? null,
    adminUserId: entry.adminUserId?.toString() ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

function toPeriodOutDto(
  doc: PeriodDoc,
  names: PlanNameMap,
): UserPlanPeriodOutDto {
  const deepseekQuotaPerPeriod = truncQuota(doc.deepseekQuotaPerPeriod);
  const quotaWindowDays = normalizeWindowDays(doc.quotaWindowDays);
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    planId: doc.planId.toString(),
    planName: names.get(doc.planId.toString()) ?? null,
    effectiveDate: doc.effectiveDate.toISOString(),
    untilDate: doc.untilDate.toISOString(),
    neverExpires: isNeverUntil(doc.untilDate),
    source: doc.source,
    createdAt: doc.createdAt?.toISOString() ?? null,
    createdBy: doc.createdBy?.toString() ?? null,
    deepseekQuotaPerPeriod,
    quotaWindowDays,
    windowCount: countQuotaWindows(
      { effectiveDate: doc.effectiveDate, untilDate: doc.untilDate },
      { quotaWindowDays },
    ),
    deepseekTokenAdjustments: (doc.deepseekTokenAdjustments ?? []).map(
      toAdjustmentOutDto,
    ),
  };
}

async function loadQuotaSnapshots(
  planIds: Types.ObjectId[],
): Promise<Map<string, PeriodQuotaSnapshot>> {
  const unique = [...new Set(planIds.map((id) => id.toString()))];
  const map = new Map<string, PeriodQuotaSnapshot>();
  if (unique.length === 0) return map;

  const plans = await PlanModel.find({
    _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
  })
    .select("deepseekQuotaPerPeriod quotaWindowDays")
    .lean<
      Array<{
        _id: Types.ObjectId;
        deepseekQuotaPerPeriod?: number;
        quotaWindowDays?: number | null;
      }>
    >();

  for (const plan of plans) {
    map.set(plan._id.toString(), {
      deepseekQuotaPerPeriod: truncQuota(plan.deepseekQuotaPerPeriod),
      quotaWindowDays: normalizeWindowDays(plan.quotaWindowDays),
    });
  }
  return map;
}

function gapsToDto(gaps: PeriodRange[]): PlanPeriodGapOutDto[] {
  return gaps.map((g) => ({
    effectiveDate: g.effectiveDate.toISOString(),
    untilDate: g.untilDate.toISOString(),
  }));
}

async function fetchPeriods(
  userId: Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<PeriodDoc[]> {
  const q = UserPlanPeriodModel.find({ userId }).sort({ effectiveDate: 1 });
  if (session) q.session(session);
  return q.lean<PeriodDoc[]>();
}

async function promoteCacheInSession(
  userId: Types.ObjectId,
  periods: PeriodDoc[],
  now: Date,
  session: mongoose.ClientSession,
): Promise<{ planId: Types.ObjectId | null; planPeriodUntil: Date | null; changed: boolean }> {
  const current = containingNow(periods, now);
  const user = await UserModel.findById(userId)
    .select("planId planPeriodUntil")
    .session(session)
    .lean<{ planId?: Types.ObjectId; planPeriodUntil?: Date | null } | null>();

  const nextPlanId = current?.planId ?? null;
  const nextUntil = current?.untilDate ?? null;

  const prevPlan = user?.planId?.toString() ?? null;
  const nextPlan = nextPlanId?.toString() ?? null;
  const prevUntil = user?.planPeriodUntil?.getTime() ?? null;
  const nextUntilMs = nextUntil?.getTime() ?? null;
  const changed = prevPlan !== nextPlan || prevUntil !== nextUntilMs;

  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        planId: nextPlanId,
        planPeriodUntil: nextUntil,
      },
    },
    { session },
  );

  return { planId: nextPlanId, planPeriodUntil: nextUntil, changed };
}

type NormalizedInput = {
  planId: Types.ObjectId;
  effectiveDate: Date;
  untilDate: Date;
  effectiveMode: "now" | "absolute";
};

/** Resolve period inputs; `effectiveMode: "now"` uses server `now` (not client clock). */
export function normalizeInputs(
  items: PlanPeriodInputDto[],
  now: Date,
): NormalizedInput[] {
  return items.map((item) => {
    if (!Types.ObjectId.isValid(item.planId)) {
      throw new Error("planId must be a valid id");
    }
    const mode = item.effectiveMode ?? "absolute";
    const untilDate = new Date(item.untilDate);
    const effectiveDate =
      mode === "now"
        ? new Date(now.getTime())
        : new Date(item.effectiveDate ?? "");
    const range = { effectiveDate, untilDate };
    assertValidRange(range);
    return {
      planId: new Types.ObjectId(item.planId),
      effectiveDate: range.effectiveDate,
      untilDate: range.untilDate,
      effectiveMode: mode,
    };
  });
}

type PreviewInternal = {
  normalized: NormalizedInput[];
  wouldTruncate: boolean;
  truncateTarget: PeriodDoc | null;
  truncateTo: Date | null;
  originalUntil: Date | null;
  remainder: {
    planId: Types.ObjectId;
    effectiveDate: Date;
    untilDate: Date;
  } | null;
  wouldCreateGaps: PeriodRange[];
  truncatedPeriodHadTokenAdjustments: boolean;
};

/**
 * Preview truncate/overlap for a batch of new periods.
 * Truncation uses >= so equal-start replace works.
 */
export function buildPreview(
  existing: PeriodDoc[],
  normalized: NormalizedInput[],
  now: Date,
  preserveRemainder: boolean,
): PreviewInternal {
  const floor = backdateFloor(now);
  for (const item of normalized) {
    // Server "now" mode is always at `now`; absolute dates may not backdate past floor.
    if (
      item.effectiveMode === "absolute" &&
      item.effectiveDate.getTime() < floor.getTime()
    ) {
      throw new Error(
        "effectiveDate cannot be earlier than now (minus 5s clock skew)",
      );
    }
  }

  // Within-batch overlap
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i]!;
      const b = normalized[j]!;
      if (
        a.effectiveDate.getTime() < b.untilDate.getTime() &&
        a.untilDate.getTime() > b.effectiveDate.getTime()
      ) {
        throw new Error("periods in the batch overlap each other");
      }
    }
  }

  // Cannot stack after a never-ending period (after_last equivalent).
  const latestByUntil = [...existing].sort(
    (a, b) => b.untilDate.getTime() - a.untilDate.getTime(),
  )[0];
  if (latestByUntil && isNeverUntil(latestByUntil.untilDate)) {
    for (const item of normalized) {
      if (item.effectiveDate.getTime() >= latestByUntil.untilDate.getTime()) {
        throw new Error(
          "Cannot continue after a never-ending period; use an effectiveDate inside the active window to replace it",
        );
      }
    }
  }

  const active = containingNow(existing, now);
  let wouldTruncate = false;
  let truncateTarget: PeriodDoc | null = null;
  let truncateTo: Date | null = null;
  let originalUntil: Date | null = null;
  let remainder: PreviewInternal["remainder"] = null;

  // Truncation: batch period starts inside active window (inclusive start).
  if (active) {
    const truncators = normalized
      .filter(
        (n) =>
          n.effectiveDate.getTime() >= active.effectiveDate.getTime() &&
          n.effectiveDate.getTime() < active.untilDate.getTime(),
      )
      .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());

    if (truncators.length > 0) {
      const first = truncators[0]!;
      if (first.effectiveDate.getTime() < floor.getTime()) {
        throw new Error(
          "Cannot truncate active period into already-elapsed time",
        );
      }

      wouldTruncate = true;
      truncateTarget = active;
      truncateTo = first.effectiveDate;
      originalUntil = active.untilDate;

      const lastNewUntil = normalized.reduce(
        (max, n) => (n.untilDate.getTime() > max.getTime() ? n.untilDate : max),
        first.untilDate,
      );

      if (lastNewUntil.getTime() < originalUntil.getTime()) {
        remainder = {
          planId: active.planId,
          effectiveDate: lastNewUntil,
          untilDate: originalUntil,
        };
      }
    }
  }

  // Simulate existing after truncate
  let simulated: PeriodRange[] = existing.map((p) => ({
    effectiveDate: p.effectiveDate,
    untilDate:
      truncateTarget && p._id.equals(truncateTarget._id) && truncateTo
        ? truncateTo
        : p.untilDate,
  }));

  // Remove zero-length after truncate (equal-start replace)
  simulated = simulated.filter(
    (p) => p.effectiveDate.getTime() < p.untilDate.getTime(),
  );

  for (const item of normalized) {
    const conflict = findOverlappingPeriod(item, simulated);
    if (conflict) {
      const existingDoc = existing.find(
        (e) =>
          e.effectiveDate.getTime() === conflict.effectiveDate.getTime() &&
          e.untilDate.getTime() === conflict.untilDate.getTime(),
      );
      if (existingDoc) {
        throw new PlanPeriodConflictError(
          "Plan period overlaps an existing period",
          toConflictPayload(existingDoc),
        );
      }
      throw new Error("Plan period overlaps an existing period");
    }
    simulated.push(item);
  }

  if (remainder && preserveRemainder) {
    const remConflict = findOverlappingPeriod(remainder, [
      ...simulated.filter(
        (s) =>
          !(
            remainder &&
            s.effectiveDate.getTime() === remainder.effectiveDate.getTime()
          ),
      ),
      ...normalized,
    ]);
    // remainder is after new periods by construction; check vs normalized
    const remVsNew = findOverlappingPeriod(remainder, normalized);
    if (remVsNew) {
      throw new Error("remainder would overlap new periods");
    }
    void remConflict;
    simulated.push(remainder);
  }

  const wouldCreateGaps: PeriodRange[] =
    remainder && !preserveRemainder
      ? [
          {
            effectiveDate: remainder.effectiveDate,
            untilDate: remainder.untilDate,
          },
        ]
      : [];

  const truncatedPeriodHadTokenAdjustments =
    wouldTruncate &&
    truncateTarget != null &&
    (truncateTarget.deepseekTokenAdjustments?.length ?? 0) > 0;

  return {
    normalized,
    wouldTruncate,
    truncateTarget,
    truncateTo,
    originalUntil,
    remainder,
    wouldCreateGaps,
    truncatedPeriodHadTokenAdjustments,
  };
}

export class UserPlanPeriodService {
  scheduleFillGaps(userId: Types.ObjectId): void {
    const key = userId.toString();
    if (fillingUsers.has(key)) return;
    fillingUsers.add(key);
    void this.fillGapsForUser(userId)
      .catch((err) => {
        logger.error(
          err instanceof Error ? err.message : String(err),
          logSource,
          "scheduleFillGaps",
        );
      })
      .finally(() => {
        fillingUsers.delete(key);
      });
  }

  async previewPeriods(
    userId: Types.ObjectId,
    input: AddPlanPeriodsDto,
  ): Promise<PlanPeriodsPreviewOutDto> {
    const user = await UserModel.findById(userId).select("_id");
    if (!user) throw new Error("User not found");

    const now = new Date();
    const existing = await fetchPeriods(userId);
    const normalized = normalizeInputs(input.periods, now);
    const plans = await PlanModel.find({
      _id: { $in: normalized.map((n) => n.planId) },
    })
      .select("_id name")
      .lean<Array<{ _id: Types.ObjectId; name: string }>>();
    if (plans.length !== new Set(normalized.map((n) => n.planId.toString())).size) {
      throw new Error("Plan not found");
    }
    const names = new Map(plans.map((p) => [p._id.toString(), p.name]));

    const preview = buildPreview(
      existing,
      normalized,
      now,
      input.preserveRemainder ?? false,
    );

    return {
      wouldTruncate: preview.wouldTruncate,
      remainder: preview.remainder
        ? {
            planId: preview.remainder.planId.toString(),
            planName: names.get(preview.remainder.planId.toString()) ?? null,
            effectiveDate: preview.remainder.effectiveDate.toISOString(),
            untilDate: preview.remainder.untilDate.toISOString(),
          }
        : null,
      wouldCreateGaps: gapsToDto(preview.wouldCreateGaps),
      normalizedPeriods: preview.normalized.map((n) => ({
        planId: n.planId.toString(),
        effectiveDate: n.effectiveDate.toISOString(),
        untilDate: n.untilDate.toISOString(),
        effectiveMode: n.effectiveMode,
      })),
      truncatedPeriodHadTokenAdjustments:
        preview.truncatedPeriodHadTokenAdjustments,
    };
  }

  /**
   * Timeline of plan periods.
   * - No pageSize: return all periods oldest→newest (user-facing).
   * - With pageSize: paginate oldest→newest (admin record navigator).
   */
  async listTimeline(
    userId: Types.ObjectId,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<UserPlanTimelineOutDto> {
    const user = await UserModel.findById(userId).select("_id");
    if (!user) throw new Error("User not found");

    const now = new Date();
    const nowMs = now.getTime();
    const paginate = opts.pageSize != null;
    const page = Math.max(1, Math.trunc(opts.page ?? 1));
    const pageSize = paginate
      ? Math.min(50, Math.max(1, Math.trunc(opts.pageSize!)))
      : 0;

    const [total, allDocs, current] = await Promise.all([
      UserPlanPeriodModel.countDocuments({ userId }),
      UserPlanPeriodModel.find({ userId })
        .select("_id planId effectiveDate untilDate")
        .sort({ effectiveDate: 1 })
        .lean<
          Array<{
            _id: Types.ObjectId;
            planId: Types.ObjectId;
            effectiveDate: Date;
            untilDate: Date;
          }>
        >(),
      this.findPeriodContainingNow(userId, now),
    ]);

    let pageDocs: PeriodDoc[];
    if (!paginate) {
      pageDocs = await UserPlanPeriodModel.find({ userId })
        .sort({ effectiveDate: 1 })
        .lean<PeriodDoc[]>();
    } else {
      pageDocs = await UserPlanPeriodModel.find({ userId })
        .sort({ effectiveDate: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<PeriodDoc[]>();
    }

    const nameIds = [
      ...pageDocs.map((p) => p.planId),
      ...(allDocs.length > 0 ? [allDocs[allDocs.length - 1]!.planId] : []),
    ];
    const names = await loadPlanNames(nameIds);
    const gaps = computeGaps(
      allDocs.map((r) => ({
        effectiveDate: r.effectiveDate,
        untilDate: r.untilDate,
      })),
    );

    let previousCount = 0;
    let upcomingCount = 0;
    let currentPeriodPage: number | null = null;
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i]!;
      if (doc.untilDate.getTime() <= nowMs) previousCount += 1;
      else if (doc.effectiveDate.getTime() > nowMs) upcomingCount += 1;
      if (current && doc._id.equals(current._id)) {
        currentPeriodPage = paginate
          ? Math.floor(i / pageSize) + 1
          : i + 1;
      }
    }

    const latestDoc =
      allDocs.length > 0 ? allDocs[allDocs.length - 1]! : null;

    const openDocs = allDocs.filter((d) => d.untilDate.getTime() > nowMs);
    const openNames = await loadPlanNames(openDocs.map((d) => d.planId));

    return {
      periods: pageDocs.map((p) => toPeriodOutDto(p, names)),
      gaps: gapsToDto(gaps),
      currentPeriodId: current?._id.toString() ?? null,
      page: paginate ? page : 1,
      pageSize: paginate ? pageSize : total,
      total,
      previousCount,
      upcomingCount,
      currentPeriodPage,
      latestPeriod: latestDoc
        ? {
            id: latestDoc._id.toString(),
            planName: names.get(latestDoc.planId.toString()) ?? null,
            untilDate: latestDoc.untilDate.toISOString(),
            neverExpires: isNeverUntil(latestDoc.untilDate),
          }
        : null,
      openPeriods: openDocs.map((d) => ({
        id: d._id.toString(),
        planId: d.planId.toString(),
        planName: openNames.get(d.planId.toString()) ?? null,
        effectiveDate: d.effectiveDate.toISOString(),
        untilDate: d.untilDate.toISOString(),
        neverExpires: isNeverUntil(d.untilDate),
        isCurrent: current != null && d._id.equals(current._id),
      })),
    };
  }

  async addPeriods(
    userId: Types.ObjectId,
    input: AddPlanPeriodsDto,
    createdBy: Types.ObjectId | null,
  ): Promise<AddPlanPeriodsResultOutDto> {
    return withUserPlanLock(userId, () =>
      this.addPeriodsUnlocked(userId, input, createdBy),
    );
  }

  private async addPeriodsUnlocked(
    userId: Types.ObjectId,
    input: AddPlanPeriodsDto,
    createdBy: Types.ObjectId | null,
  ): Promise<AddPlanPeriodsResultOutDto> {
    const user = await UserModel.findById(userId).select("_id");
    if (!user) throw new Error("User not found");

    const preserveRemainder = input.preserveRemainder ?? false;

    let truncatedPeriodId: string | null = null;
    let remainderCreated = false;
    let truncatedPeriodHadTokenAdjustments = false;
    let planChanged = false;
    let newMaxApiKeys: number | null = null;
    let normalized: NormalizedInput[] = [];

    try {
      await mongoose.connection.transaction(async (session) => {
        await UserModel.updateOne(
          { _id: userId },
          { $inc: { planVersion: 1 } },
          { session },
        );

        const now = new Date();
        normalized = normalizeInputs(input.periods, now);

        const planCount = await PlanModel.countDocuments({
          _id: { $in: normalized.map((n) => n.planId) },
        }).session(session);
        if (
          planCount !== new Set(normalized.map((n) => n.planId.toString())).size
        ) {
          throw new Error("Plan not found");
        }

        const existing = await fetchPeriods(userId, session);
        const preview = buildPreview(
          existing,
          normalized,
          now,
          preserveRemainder,
        );
        truncatedPeriodHadTokenAdjustments =
          preview.truncatedPeriodHadTokenAdjustments;

        if (
          preview.wouldTruncate &&
          preview.truncateTarget &&
          preview.truncateTo
        ) {
          await UserPlanPeriodModel.updateOne(
            { _id: preview.truncateTarget._id },
            { $set: { untilDate: preview.truncateTo } },
            { session },
          );
          truncatedPeriodId = preview.truncateTarget._id.toString();
        }

        const snapshotPlanIds = [
          ...preview.normalized.map((n) => n.planId),
          ...(preview.remainder ? [preview.remainder.planId] : []),
        ];
        const snapshots = await loadQuotaSnapshots(snapshotPlanIds);

        const toInsert: Array<Record<string, unknown>> = preview.normalized.map(
          (n) => {
            const snap = snapshots.get(n.planId.toString()) ?? {
              deepseekQuotaPerPeriod: 0,
              quotaWindowDays: null,
            };
            return {
              userId,
              planId: n.planId,
              effectiveDate: n.effectiveDate,
              untilDate: n.untilDate,
              source: "manual",
              createdBy,
              deepseekQuotaPerPeriod: snap.deepseekQuotaPerPeriod,
              quotaWindowDays: snap.quotaWindowDays,
              deepseekTokenAdjustments: [],
            };
          },
        );

        if (preserveRemainder && preview.remainder) {
          const remSnap = snapshots.get(
            preview.remainder.planId.toString(),
          ) ?? { deepseekQuotaPerPeriod: 0, quotaWindowDays: null };
          toInsert.push({
            userId,
            planId: preview.remainder.planId,
            effectiveDate: preview.remainder.effectiveDate,
            untilDate: preview.remainder.untilDate,
            source: "manual",
            createdBy,
            deepseekQuotaPerPeriod: remSnap.deepseekQuotaPerPeriod,
            quotaWindowDays: remSnap.quotaWindowDays,
            deepseekTokenAdjustments: [],
          });
          remainderCreated = true;
        }

        await UserPlanPeriodModel.create(toInsert, { session, ordered: true });

        const after = await fetchPeriods(userId, session);
        const promo = await promoteCacheInSession(userId, after, now, session);
        planChanged = promo.changed;
        if (promo.planId) {
          const plan = await PlanModel.findById(promo.planId)
            .select("maxApiKeys")
            .session(session)
            .lean<{ maxApiKeys: number } | null>();
          newMaxApiKeys = plan?.maxApiKeys ?? null;
        }
      });
    } catch (err) {
      if (isDuplicateKeyError(err) && normalized.length > 0) {
        const existing = await fetchPeriods(userId);
        for (const item of normalized) {
          const conflict = findOverlappingPeriod(item, existing);
          if (conflict) {
            const doc = existing.find(
              (e) =>
                e.effectiveDate.getTime() === conflict.effectiveDate.getTime(),
            );
            if (doc) {
              throw new PlanPeriodConflictError(
                "Plan period overlaps an existing period",
                toConflictPayload(doc),
              );
            }
          }
        }
        throw new PlanPeriodConflictError(
          "Plan period conflicts with an existing period",
          {
            id: "",
            userId: userId.toString(),
            planId: normalized[0]!.planId.toString(),
            effectiveDate: normalized[0]!.effectiveDate.toISOString(),
            untilDate: normalized[0]!.untilDate.toISOString(),
            source: "manual",
          },
        );
      }
      throw err;
    }

    await this.fillGapsForUserUnlocked(userId);

    if (planChanged && newMaxApiKeys !== null) {
      await syncApiKeysToPlanLimit(userId, newMaxApiKeys);
    }

    const timeline = await this.listTimeline(userId);
    return {
      periods: timeline.periods.filter((p) => p.source === "manual"),
      truncatedPeriodId,
      remainderCreated,
      timeline,
      truncatedPeriodHadTokenAdjustments,
    };
  }

  async removePeriod(
    userId: Types.ObjectId,
    periodId: Types.ObjectId,
  ): Promise<UserPlanTimelineOutDto> {
    return withUserPlanLock(userId, () =>
      this.removePeriodUnlocked(userId, periodId),
    );
  }

  private async removePeriodUnlocked(
    userId: Types.ObjectId,
    periodId: Types.ObjectId,
  ): Promise<UserPlanTimelineOutDto> {
    const now = new Date();

    try {
      await mongoose.connection.transaction(async (session) => {
        await UserModel.updateOne(
          { _id: userId },
          { $inc: { planVersion: 1 } },
          { session },
        );

        const period = await UserPlanPeriodModel.findOne({
          _id: periodId,
          userId,
        }).session(session);

        if (!period) throw new Error("Plan period not found");
        if (period.effectiveDate.getTime() <= now.getTime()) {
          throw new Error("Only future plan periods can be removed");
        }

        await UserPlanPeriodModel.deleteOne({ _id: periodId }).session(session);
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new Error("Failed to remove plan period due to concurrent update");
      }
      throw err;
    }

    await this.fillGapsForUserUnlocked(userId);
    return this.listTimeline(userId);
  }

  /**
   * Idempotent gap filler. Promotes cache even when no inserts are needed.
   */
  async fillGapsForUser(
    userId: Types.ObjectId,
  ): Promise<{ inserted: number; planChanged: boolean }> {
    return withUserPlanLock(userId, () => this.fillGapsForUserUnlocked(userId));
  }

  private async fillGapsForUserUnlocked(
    userId: Types.ObjectId,
  ): Promise<{ inserted: number; planChanged: boolean }> {
    const user = await UserModel.findById(userId).select("_id");
    if (!user) throw new Error("User not found");

    const defaultPlan = await PlanModel.findOne({ isDefaultPlan: true })
      .select("_id maxApiKeys")
      .lean<{ _id: Types.ObjectId; maxApiKeys: number } | null>();
    if (!defaultPlan) throw new Error("Default plan not found");

    let inserted = 0;
    let planChanged = false;
    let maxApiKeys: number | null = null;

    await mongoose.connection.transaction(async (session) => {
      await UserModel.updateOne(
        { _id: userId },
        { $inc: { planVersion: 1 } },
        { session },
      );

      const now = new Date();
      let periods = sortByEffective(await fetchPeriods(userId, session));

      // Never fill after a sentinel (never-ending) period that covers or precedes forward timeline
      const hasNeverCovering = periods.some(
        (p) =>
          isNeverUntil(p.untilDate) &&
          p.effectiveDate.getTime() <= now.getTime(),
      );

      const defaultSnap = await loadQuotaSnapshots([defaultPlan._id]);
      const defaultQuota = defaultSnap.get(defaultPlan._id.toString()) ?? {
        deepseekQuotaPerPeriod: 0,
        quotaWindowDays: null,
      };

      const creates: Array<{
        userId: Types.ObjectId;
        planId: Types.ObjectId;
        effectiveDate: Date;
        untilDate: Date;
        source: "default_sync";
        createdBy: null;
        deepseekQuotaPerPeriod: number;
        quotaWindowDays: number | null;
        deepseekTokenAdjustments: [];
      }> = [];

      if (!hasNeverCovering) {
        const gapsToFill: PeriodRange[] = [];

        const current = containingNow(periods, now);
        if (!current) {
          const previous = [...periods]
            .filter((p) => p.untilDate.getTime() <= now.getTime())
            .sort((a, b) => b.untilDate.getTime() - a.untilDate.getTime())[0];
          const gapStart = previous?.untilDate ?? now;
          const next = periods.find(
            (p) => p.effectiveDate.getTime() > gapStart.getTime(),
          );
          gapsToFill.push({
            effectiveDate: gapStart,
            untilDate: next?.effectiveDate ?? addCalendarMonths(gapStart, 1),
          });
        }

        for (const g of computeGaps(periods)) {
          if (g.untilDate.getTime() <= now.getTime()) continue;
          if (isNeverUntil(g.effectiveDate)) continue;
          gapsToFill.push(g);
        }

        for (const gap of gapsToFill) {
          let cursor = gap.effectiveDate;
          const hardEnd = gap.untilDate;
          while (cursor.getTime() < hardEnd.getTime()) {
            if (isNeverUntil(cursor)) break;
            const monthEnd = addCalendarMonths(cursor, 1);
            const end =
              monthEnd.getTime() < hardEnd.getTime() ? monthEnd : hardEnd;
            if (end.getTime() <= cursor.getTime()) break;
            if (!findOverlappingPeriod({ effectiveDate: cursor, untilDate: end }, periods)) {
              creates.push({
                userId,
                planId: defaultPlan._id,
                effectiveDate: new Date(cursor),
                untilDate: new Date(end),
                source: "default_sync",
                createdBy: null,
                deepseekQuotaPerPeriod: defaultQuota.deepseekQuotaPerPeriod,
                quotaWindowDays: defaultQuota.quotaWindowDays,
                deepseekTokenAdjustments: [],
              });
            }
            cursor = end;
            // When filling "now" with no next period, one month chunk is enough
            if (
              !containingNow(periods, now) &&
              !periods.some((p) => p.effectiveDate.getTime() > now.getTime()) &&
              cursor.getTime() > now.getTime()
            ) {
              break;
            }
          }
        }
      }

      // Dedupe by effectiveDate
      const byStart = new Map<number, (typeof creates)[0]>();
      for (const c of creates) byStart.set(c.effectiveDate.getTime(), c);
      const uniqueCreates = [...byStart.values()];

      if (uniqueCreates.length > 0) {
        await UserPlanPeriodModel.create(uniqueCreates, {
          session,
          ordered: true,
        });
        inserted = uniqueCreates.length;
        periods = sortByEffective(await fetchPeriods(userId, session));
      }

      const promo = await promoteCacheInSession(userId, periods, now, session);
      planChanged = promo.changed;
      if (promo.planId) {
        const plan = await PlanModel.findById(promo.planId)
          .select("maxApiKeys")
          .session(session)
          .lean<{ maxApiKeys: number } | null>();
        maxApiKeys = plan?.maxApiKeys ?? defaultPlan.maxApiKeys;
      } else {
        maxApiKeys = defaultPlan.maxApiKeys;
      }
    });

    if (planChanged && maxApiKeys !== null) {
      await syncApiKeysToPlanLimit(userId, maxApiKeys);
    }

    return { inserted, planChanged };
  }

  /** Read-only resolve of period containing now. */
  async findPeriodContainingNow(
    userId: Types.ObjectId,
    now: Date = new Date(),
  ): Promise<PeriodDoc | null> {
    return UserPlanPeriodModel.findOne({
      userId,
      effectiveDate: { $lte: now },
      untilDate: { $gt: now },
    })
      .sort({ effectiveDate: -1 })
      .lean<PeriodDoc | null>();
  }

  async snapshotQuotaFromPlan(
    planId: Types.ObjectId,
  ): Promise<PeriodQuotaSnapshot> {
    const map = await loadQuotaSnapshots([planId]);
    return (
      map.get(planId.toString()) ?? {
        deepseekQuotaPerPeriod: 0,
        quotaWindowDays: null,
      }
    );
  }

  async getCurrentPeriodQuota(
    userId: Types.ObjectId,
    now: Date = new Date(),
  ): Promise<CurrentPeriodQuotaOutDto | null> {
    const period = await this.findPeriodContainingNow(userId, now);
    if (!period) return null;

    const names = await loadPlanNames([period.planId]);
    const quotaWindowDays = normalizeWindowDays(period.quotaWindowDays);
    const deepseekQuotaPerPeriod = truncQuota(period.deepseekQuotaPerPeriod);
    const window = getQuotaWindow(
      { effectiveDate: period.effectiveDate, untilDate: period.untilDate },
      { quotaWindowDays },
      now,
    );

    let deepseekWindow: CurrentPeriodQuotaOutDto["deepseekWindow"] = null;
    if (window) {
      const usage = period.deepseekUsage;
      const sameWindow = usage?.windowIndex === window.windowIndex;
      deepseekWindow = {
        windowIndex: window.windowIndex,
        inputTokens: sameWindow ? truncQuota(usage?.inputTokens) : 0,
        outputTokens: sameWindow ? truncQuota(usage?.outputTokens) : 0,
        totalTokens: usedInWindow(usage, window.windowIndex),
        windowStart: window.windowStart.toISOString(),
        windowEnd: window.windowEnd.toISOString(),
      };
    }

    return {
      periodId: period._id.toString(),
      planId: period.planId.toString(),
      planName: names.get(period.planId.toString()) ?? null,
      deepseekQuotaPerPeriod,
      quotaWindowDays,
      windowCount: countQuotaWindows(
        { effectiveDate: period.effectiveDate, untilDate: period.untilDate },
        { quotaWindowDays },
      ),
      deepseekWindow,
      deepseekTokenAdjustments: (period.deepseekTokenAdjustments ?? []).map(
        toAdjustmentOutDto,
      ),
    };
  }

  async adjustTokens(
    userId: Types.ObjectId,
    periodId: Types.ObjectId,
    input: AdjustPeriodTokensDto,
    adminUserId: Types.ObjectId | null,
  ): Promise<UserPlanPeriodOutDto> {
    const amount = input.amount;
    if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) {
      throw new Error("amount must be a non-zero integer");
    }
    const reason = input.reason.trim();
    if (!reason) throw new Error("reason is required");

    const now = new Date();
    const updated = await UserPlanPeriodModel.findOneAndUpdate(
      { _id: periodId, userId },
      [
        {
          $set: {
            _requestedAmount: amount,
            _appliedAmount: {
              $let: {
                vars: {
                  next: { $add: ["$deepseekQuotaPerPeriod", amount] },
                },
                in: {
                  $cond: [
                    { $lt: ["$$next", 0] },
                    { $multiply: ["$deepseekQuotaPerPeriod", -1] },
                    amount,
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            deepseekQuotaPerPeriod: {
              $add: ["$deepseekQuotaPerPeriod", "$_appliedAmount"],
            },
            deepseekTokenAdjustments: {
              $concatArrays: [
                { $ifNull: ["$deepseekTokenAdjustments", []] },
                [
                  {
                    requestedAmount: "$_requestedAmount",
                    appliedAmount: "$_appliedAmount",
                    reason,
                    source: "admin",
                    invoiceId: null,
                    adminUserId,
                    createdAt: now,
                  },
                ],
              ],
            },
          },
        },
        { $unset: ["_requestedAmount", "_appliedAmount"] },
      ],
      { returnDocument: "after", updatePipeline: true },
    ).lean<PeriodDoc | null>();

    if (!updated) throw new Error("Plan period not found");

    const names = await loadPlanNames([updated.planId]);
    return toPeriodOutDto(updated, names);
  }

  /**
   * Atomically $inc deepseekQuotaPerPeriod (floor 0) and append invoice history.
   * Returns the period after update.
   */
  async applyInvoiceTokenTopup(
    periodId: Types.ObjectId,
    tokens: number,
    invoiceId: Types.ObjectId,
    reason: string,
  ): Promise<PeriodDoc> {
    if (!Number.isFinite(tokens) || tokens === 0 || !Number.isInteger(tokens)) {
      throw new Error("deepseekTokens must be a non-zero integer");
    }
    const now = new Date();
    const updated = await UserPlanPeriodModel.findOneAndUpdate(
      { _id: periodId },
      [
        {
          $set: {
            _requestedAmount: tokens,
            _appliedAmount: {
              $let: {
                vars: {
                  next: { $add: ["$deepseekQuotaPerPeriod", tokens] },
                },
                in: {
                  $cond: [
                    { $lt: ["$$next", 0] },
                    { $multiply: ["$deepseekQuotaPerPeriod", -1] },
                    tokens,
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            deepseekQuotaPerPeriod: {
              $add: ["$deepseekQuotaPerPeriod", "$_appliedAmount"],
            },
            deepseekTokenAdjustments: {
              $concatArrays: [
                { $ifNull: ["$deepseekTokenAdjustments", []] },
                [
                  {
                    requestedAmount: "$_requestedAmount",
                    appliedAmount: "$_appliedAmount",
                    reason,
                    source: "invoice",
                    invoiceId,
                    adminUserId: null,
                    createdAt: now,
                  },
                ],
              ],
            },
          },
        },
        { $unset: ["_requestedAmount", "_appliedAmount"] },
      ],
      { returnDocument: "after", updatePipeline: true },
    ).lean<PeriodDoc | null>();

    if (!updated) throw new Error("Plan period not found");
    return updated;
  }

  async loadPlanDoc(planId: Types.ObjectId) {
    return PlanModel.findById(planId).select(PLAN_SELECT).lean<
      PlanInterface & { _id: Types.ObjectId }
    >();
  }

  async getDefaultPlanDoc() {
    return PlanModel.findOne({ isDefaultPlan: true })
      .select(PLAN_SELECT)
      .lean<PlanInterface & { _id: Types.ObjectId } | null>();
  }
}

export const userPlanPeriodService = new UserPlanPeriodService();

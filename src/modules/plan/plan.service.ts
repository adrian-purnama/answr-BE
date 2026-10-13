import mongoose, { Types } from "mongoose";
import type { CreatePlanDto, PlanOutDto, UpdatePlanDto } from "../../dto/plan.dto";
import { logger } from "../../logger/logger";
import { PlanModel } from "../../models/plan/plan.model";
import type { PlanInterface } from "../../models/plan/plan.interface";

const logSource = "modules/plan/plan.service.ts";

type PlanDoc = PlanInterface & { _id: Types.ObjectId };

function toPlanOutDto(doc: PlanDoc): PlanOutDto {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    pricePerMonth: doc.pricePerMonth,
    priceLabel: doc.priceLabel,
    priceNote: doc.priceNote,
    maxApiKeys: doc.maxApiKeys,
    maxRequestsPerMinute: doc.maxRequestsPerMinute,
    maxArticles: doc.maxArticles ?? 10,
    maxTopicsPerArticle: doc.maxTopicsPerArticle ?? 50,
    maxImagesPerTopic: doc.maxImagesPerTopic ?? 10,
    maxCharactersPerTopic: doc.maxCharactersPerTopic ?? 10000,
    maxSnippets: doc.maxSnippets ?? 50,
    maxImagesPerSnippet: doc.maxImagesPerSnippet ?? 10,
    maxCharactersPerSnippet: doc.maxCharactersPerSnippet ?? 5000,
    maxGuidances: doc.maxGuidances ?? 10,
    maxCharactersPerGuidance: doc.maxCharactersPerGuidance ?? 2000,
    maxLiveAgents: doc.maxLiveAgents ?? 0,
    liveAgent: doc.liveAgent ?? false,
    meetingTool: doc.meetingTool ?? false,
    leadCapture: doc.leadCapture ?? false,
    whatsApp: doc.whatsApp ?? false,
    maxMeetingTopics: doc.maxMeetingTopics ?? 0,
    batchTestGroupAmount: doc.batchTestGroupAmount ?? 5,
    questionsPerBatchTestGroup: doc.questionsPerBatchTestGroup ?? 50,
    analyticsLookbackDays: doc.analyticsLookbackDays ?? 30,
    deepseekQuotaPerPeriod: doc.deepseekQuotaPerPeriod ?? 0,
    quotaWindowDays:
      typeof doc.quotaWindowDays === "number" &&
      Number.isFinite(doc.quotaWindowDays) &&
      doc.quotaWindowDays >= 1
        ? Math.trunc(doc.quotaWindowDays)
        : null,
    accentColor: doc.accentColor,
    order: doc.order,
    showOnPricingPage: doc.showOnPricingPage,
    isDefaultPlan: doc.isDefaultPlan,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class PlanService {
  async getAll(): Promise<PlanOutDto[]> {
    const plans = await PlanModel.find().sort({ order: 1 }).lean<PlanDoc[]>();
    return plans.map(toPlanOutDto);
  }

  async getPricingPlans(): Promise<PlanOutDto[]> {
    const plans = await PlanModel.find({
      isActive: true,
      showOnPricingPage: true,
    })
      .sort({ order: 1 })
      .lean<PlanDoc[]>();
    return plans.map(toPlanOutDto);
  }

  async create(input: CreatePlanDto): Promise<PlanOutDto> {
    const slug = input.slug.trim().toLowerCase();
    const existing = await PlanModel.findOne({ slug });
    if (existing) {
      throw new Error("Plan slug already exists");
    }

    let created: PlanDoc;

    if (input.isDefaultPlan) {
      const [doc] = await mongoose.connection.transaction(async (session) => {
        await PlanModel.updateMany(
          {},
          { $set: { isDefaultPlan: false } },
          { session },
        );
        return PlanModel.create(
          [{ ...input, slug }],
          { session },
        );
      });
      created = doc.toObject() as PlanDoc;
    } else {
      const doc = await PlanModel.create({ ...input, slug });
      created = doc.toObject() as PlanDoc;
    }

    logger.info(`Plan created: ${slug}`, logSource, "create");
    return toPlanOutDto(created);
  }

  async update(id: string, patch: UpdatePlanDto): Promise<PlanOutDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Invalid plan id");
    }

    const planId = new Types.ObjectId(id);
    const existing = await PlanModel.findById(planId);
    if (!existing) {
      throw new Error("Plan not found");
    }

    if (patch.slug !== undefined) {
      const slug = patch.slug.trim().toLowerCase();
      const slugTaken = await PlanModel.findOne({
        slug,
        _id: { $ne: planId },
      });
      if (slugTaken) {
        throw new Error("Plan slug already exists");
      }
      patch = { ...patch, slug };
    }

    let updated: PlanDoc;

    if (patch.isDefaultPlan === true) {
      const doc = await mongoose.connection.transaction(async (session) => {
        await PlanModel.updateMany(
          { _id: { $ne: planId } },
          { $set: { isDefaultPlan: false } },
          { session },
        );
        return PlanModel.findByIdAndUpdate(
          planId,
          { $set: patch },
          { new: true, session },
        ).lean<PlanDoc>();
      });
      if (!doc) throw new Error("Plan not found");
      updated = doc;
    } else {
      const doc = await PlanModel.findByIdAndUpdate(
        planId,
        { $set: patch },
        { new: true },
      ).lean<PlanDoc>();
      if (!doc) throw new Error("Plan not found");
      updated = doc;
    }

    logger.info(`Plan updated: ${updated.slug}`, logSource, "update");
    return toPlanOutDto(updated);
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("Invalid plan id");
    }

    const plan = await PlanModel.findById(id);
    if (!plan) {
      throw new Error("Plan not found");
    }

    if (plan.isDefaultPlan) {
      throw new Error(
        "Cannot delete the default plan. Assign another plan as default first.",
      );
    }

    await PlanModel.findByIdAndDelete(id);
    logger.info(`Plan deleted: ${plan.slug}`, logSource, "delete");
  }

  async getDefaultPlan(): Promise<Types.ObjectId> {
    const plan = await PlanModel.findOne({ isDefaultPlan: true });
    if (!plan) {
      throw new Error("Default plan not found");
    }
    return plan._id;
  }
}

export const planService = new PlanService();

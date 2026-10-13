import { Schema, model } from "mongoose";
import { PlanInterface } from "./plan.interface";


const PlanSchema = new Schema<PlanInterface>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        pricePerMonth: {
            type: Number,
            required: true,
            min: 0,
        },

        priceLabel: {
            type: Number,
            required: true,
            min: 0,
        },

        priceNote: {
            type: String,
            required: true,
            trim: true,
        },

        maxApiKeys: {
            type: Number,
            required: true,
            min: 0,
        },

        maxRequestsPerMinute: {
            type: Number,
            required: true,
            min: 0,
        },

        maxArticles: {
            type: Number,
            required: true,
            min: 0,
            default: 10,
        },

        maxTopicsPerArticle: {
            type: Number,
            required: true,
            min: 0,
            default: 50,
        },

        maxImagesPerTopic: {
            type: Number,
            required: true,
            min: 0,
            default: 10,
        },

        maxCharactersPerTopic: {
            type: Number,
            required: true,
            min: 0,
            default: 10000,
        },

        maxSnippets: {
            type: Number,
            required: true,
            min: 0,
            default: 50,
        },

        maxImagesPerSnippet: {
            type: Number,
            required: true,
            min: 0,
            default: 10,
        },

        maxCharactersPerSnippet: {
            type: Number,
            required: true,
            min: 0,
            default: 5000,
        },

        maxGuidances: {
            type: Number,
            required: true,
            min: 0,
            default: 10,
        },

        maxCharactersPerGuidance: {
            type: Number,
            required: true,
            min: 0,
            default: 2000,
        },

        maxLiveAgents: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        liveAgent: {
            type: Boolean,
            required: true,
            default: false,
        },

        meetingTool: {
            type: Boolean,
            required: true,
            default: false,
        },

        leadCapture: {
            type: Boolean,
            required: true,
            default: false,
        },

        whatsApp: {
            type: Boolean,
            required: true,
            default: false,
        },

        maxMeetingTopics: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        batchTestGroupAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 5,
        },

        questionsPerBatchTestGroup: {
            type: Number,
            required: true,
            min: 0,
            default: 50,
        },

        analyticsLookbackDays: {
            type: Number,
            required: true,
            min: 0,
            default: 30,
        },

        /** Token limit for one quota window (see quotaWindowDays), not per calendar month. */
        deepseekQuotaPerPeriod: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        /** null = whole plan period; a number resets every N days within the period. */
        quotaWindowDays: {
            type: Number,
            required: false,
            default: null,
            validate: {
                validator: (v: unknown) =>
                    v == null ||
                    (typeof v === "number" && Number.isFinite(v) && v >= 1),
                message: "quotaWindowDays must be null or a number >= 1",
            },
        },

        accentColor: {
            type: String,
            required: true,
            trim: true,
        },

        order: {
            type: Number,
            required: true,
            default: 0,
        },

        showOnPricingPage: {
            type: Boolean,
            required: true,
            default: true,
        },

        isDefaultPlan: {
            type: Boolean,
            required: true,
            default: false,
        },

        isActive: {
            type: Boolean,
            required: true,
            default: true,
        },
    },
    {
        timestamps: true,
    },
);

export const PlanModel = model<PlanInterface>("Plan", PlanSchema);

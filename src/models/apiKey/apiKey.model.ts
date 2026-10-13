import { model, Schema } from "mongoose";
import {
    defaultLeadCaptureFields,
    LEAD_CAPTURE_STRATEGY_VALUES,
    LEAD_FIELD_TYPE_VALUES,
} from "../leadCapture/leadCapture.interface";
import { ApiKeyInterface } from "./apiKey.interface";

const leadFieldConfigSchema = new Schema(
    {
        id: { type: String, required: true, trim: true },
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: LEAD_FIELD_TYPE_VALUES,
            required: true,
        },
        required: { type: Boolean, required: true },
        order: { type: Number, required: true },
    },
    { _id: false },
);

const liveAgentSettingSchema = new Schema(
    {
        enabled: { type: Boolean, required: true, default: false },
        code: { type: String, required: false, trim: true, uppercase: true },
        resilience: {
            type: String,
            enum: ["low", "medium", "high", "never"],
            required: true,
            default: "medium",
        },
        notifyEmail: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },
    },
    { _id: false },
);

const leadCaptureSettingSchema = new Schema(
    {
        enabled: { type: Boolean, required: true, default: false },
        strategy: {
            type: String,
            enum: LEAD_CAPTURE_STRATEGY_VALUES,
            required: true,
            default: "subtle",
        },
        fields: {
            type: [leadFieldConfigSchema],
            required: true,
            default: defaultLeadCaptureFields,
        },
    },
    { _id: false },
);

const whatsAppSettingSchema = new Schema(
    {
        enabled: { type: Boolean, required: true, default: false },
        defaultFlow: { type: Boolean, required: true, default: false },
        sessionName: { type: String, default: null },
        status: { type: String, default: null },
        meId: { type: String, default: null },
        mePushName: { type: String, default: null },
        lastSyncedAt: { type: Date, default: null },
    },
    { _id: false },
);

const apiKeySchema = new Schema<ApiKeyInterface>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: 64,
    },
    description: {
        type: String,
        required: true,
        default: "",
        trim: true,
        maxlength: 500,
    },
    prefix: {
        type: String,
        required: true,
        trim: true,
    },
    hashedKey: {
        type: String,
        required: true,
    },
    ipAllowlist: {
        type: [String],
        required: true,
        default: [],
    },
    lastUsedAt: {
        type: Date,
        default: null,
    },
    status: {
        status: {
            type: String,
            enum: ["active", "disabled_plan", "revoked"],
            required: true,
        },
        appliedAt: {
            type: Date,
            required: true,
        },
    },
    liveAgentSetting: {
        type: liveAgentSettingSchema,
        required: true,
        default: () => ({
            enabled: false,
            resilience: "medium",
            notifyEmail: "",
        }),
    },
    leadCaptureSetting: {
        type: leadCaptureSettingSchema,
        required: true,
        default: () => ({
            enabled: false,
            strategy: "subtle",
            fields: defaultLeadCaptureFields(),
        }),
    },
    whatsAppSetting: {
        type: whatsAppSettingSchema,
        required: true,
        default: () => ({
            enabled: false,
            defaultFlow: false,
            sessionName: null,
            status: null,
            meId: null,
            mePushName: null,
            lastSyncedAt: null,
        }),
    },
    enhancedRetrieval: {
        type: Boolean,
        required: true,
        default: false,
    },
});

apiKeySchema.index(
    { "liveAgentSetting.code": 1 },
    { unique: true, sparse: true },
);

export const ApiKeyModel = model<ApiKeyInterface>("ApiKey", apiKeySchema);

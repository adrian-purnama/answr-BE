import mongoose from "mongoose";
import type { WidgetInterface } from "./widget.interface";
import {
  DEFAULT_LOGIN_PROMPT_MESSAGE,
  VISITOR_JWT_ALGORITHM_VALUES,
  WIDGET_ACCESS_MODE_VALUES,
} from "./widget.interface";

const widgetSectionSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: false },
);

const widgetFaqEntrySchema = new mongoose.Schema(
  {
    articleId: { type: String, required: true },
    topicIds: { type: [String], required: true, default: [] },
  },
  { _id: false },
);

const widgetFaqSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    title: {
      type: String,
      required: false,
    },
    enableSearch: {
      type: Boolean,
      required: false,
      default: true,
    },
    searchPlaceholder: {
      type: String,
      required: false,
    },
    entries: {
      type: [widgetFaqEntrySchema],
      required: true,
      default: [],
    },
  },
  { _id: false },
);

const widgetChatSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    initialQuestions: {
      type: [String],
      required: true,
      default: [],
    },
    /** When true, generate relevant follow-up chips after each agent reply. */
    enableFollowupQuestions: {
      type: Boolean,
      required: true,
      default: true,
    },
    agentProfilePicture: {
      type: String,
      required: false,
      default: "",
    },
    agentDescription: {
      type: String,
      required: true,
      default: "The team can also help",
    },
    agentInitialMessage: {
      type: String,
      required: true,
      default: "Hi, you're speaking with our AI Agent.",
    },
    agentName: {
      type: String,
      required: true,
      default: "AI Agent",
    },
  },
  { _id: false },
);

/**
 * Home settings including free-position canvas elements.
 * Element shapes are validated at the service boundary (discriminated unions).
 */
const widgetHomeSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    logo: {
      type: String,
      required: false,
      default: "",
    },
    backgroundImage: {
      type: String,
      required: false,
      default: "",
    },
    backgroundDim: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    greeting: {
      type: String,
      required: false,
      default: "How can we help?",
    },
    greetingColor: {
      type: String,
      required: false,
      default: "",
    },
    elements: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false },
);

const widgetSchema = new mongoose.Schema<WidgetInterface>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
      unique: true,
    },
    publicKey: {
      type: String,
      required: true,
      unique: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    darkMode: {
      type: Boolean,
      required: true,
      default: false,
    },
    badgeImage: {
      type: String,
      required: false,
      default: "",
    },
    accessMode: {
      type: String,
      enum: WIDGET_ACCESS_MODE_VALUES,
      required: true,
      default: "both",
    },
    loginPrompt: {
      type: {
        enabled: {
          type: Boolean,
          required: true,
          default: false,
        },
        message: {
          type: String,
          required: true,
          default: DEFAULT_LOGIN_PROMPT_MESSAGE,
          trim: true,
        },
        loginLink: {
          type: String,
          required: false,
          default: "",
          trim: true,
        },
      },
      required: true,
      default: () => ({
        enabled: false,
        message: DEFAULT_LOGIN_PROMPT_MESSAGE,
        loginLink: "",
      }),
    },
    visitorJwtPublicKeyPem: {
      type: String,
      required: false,
      default: "",
    },
    visitorJwtAlgorithm: {
      type: String,
      enum: VISITOR_JWT_ALGORITHM_VALUES,
      required: true,
      default: "RS256",
    },
    visitorJwtIssuer: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    allowedDomains: {
      type: [String],
      required: true,
      default: [],
    },
    homeSettings: {
      type: widgetHomeSettingsSchema,
      required: true,
      default: () => ({
        enabled: true,
        logo: "",
        greeting: "How can we help?",
        backgroundImage: "",
        backgroundDim: 0,
        elements: [],
      }),
    },
    chatSettings: {
      type: widgetChatSettingsSchema,
      required: true,
      default: () => ({
        enabled: true,
        initialQuestions: [],
        enableFollowupQuestions: true,
        agentProfilePicture: "",
        agentDescription: "The team can also help",
        agentInitialMessage: "Hi, you're speaking with our AI Agent.",
        agentName: "AI Agent",
      }),
    },
    faqSettings: {
      type: widgetFaqSettingsSchema,
      required: true,
      default: () => ({
        enabled: true,
        title: "Help",
        enableSearch: true,
        searchPlaceholder: "Search for help",
        entries: [],
      }),
    },
    newsSettings: {
      type: widgetSectionSettingsSchema,
      required: true,
      default: () => ({ enabled: true }),
    },
  },
  { timestamps: true },
);

const Widget = mongoose.model<WidgetInterface>("Widget", widgetSchema);

export default Widget;

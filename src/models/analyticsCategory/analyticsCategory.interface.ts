import type { Types } from "mongoose";

/** Global fallback. Not listed or editable on a project. */
export const UNCATEGORIZED_CATEGORY_SEED = {
  slug: "uncategorized",
  name: "Uncategorized",
} as const;

export const ANALYTICS_OPTION_DIMENSIONS = [
  "category",
  "type",
  "gap",
  "answerable",
  "intent",
] as const;

export type AnalyticsOptionDimension =
  (typeof ANALYTICS_OPTION_DIMENSIONS)[number];

export type AnalyticsOptionSeed = {
  slug: string;
  name: string;
  description: string;
};

/** Copied onto each project once. Later edits and deletes are left alone. */
export const PROJECT_ANALYTICS_CATEGORY_SEEDS: readonly AnalyticsOptionSeed[] = [
  {
    slug: "support",
    name: "Support",
    description: "how-to, account help, and general assistance",
  },
  {
    slug: "error",
    name: "Error",
    description: "app crashes, bugs, technical failures, and broken features",
  },
  {
    slug: "sales",
    name: "Sales",
    description: "pricing, new contracts, upgrades",
  },
  {
    slug: "billing",
    name: "Billing",
    description: "invoices, payments, refunds",
  },
  {
    slug: "feedback",
    name: "Feedback",
    description: "praise, complaints, and product suggestions",
  },
  {
    slug: "other",
    name: "Other",
    description: "anything that does not fit the categories above",
  },
];

export const PROJECT_ANALYTICS_TYPE_SEEDS: readonly AnalyticsOptionSeed[] = [
  { slug: "query", name: "Query", description: "the user is asking a question or requesting information" },
  { slug: "answer", name: "Answer", description: "the user is answering a question the agent asked" },
  { slug: "confirmation", name: "Confirmation", description: "the user agrees, accepts, or says yes" },
  { slug: "rejection", name: "Rejection", description: "the user declines, cancels, or says no" },
  { slug: "clarification", name: "Clarification", description: "the user is making a previous message clearer" },
  { slug: "greeting", name: "Greeting", description: "hello, hi, or a welcome" },
  { slug: "acknowledgement", name: "Acknowledgement", description: "thanks, ok, or got it, with no new request" },
  { slug: "farewell", name: "Farewell", description: "goodbye or ending the conversation" },
  { slug: "filler", name: "Filler", description: "small talk or a message with no request" },
  { slug: "instruction", name: "Instruction", description: "the user tells the agent to do something" },
  { slug: "tool_related", name: "Tool related", description: "the message is about using a tool or its result" },
];

export const PROJECT_ANALYTICS_GAP_SEEDS: readonly AnalyticsOptionSeed[] = [
  { slug: "missing_knowledge", name: "Missing knowledge", description: "the answer needs information the agent does not have" },
  { slug: "unsupported_action", name: "Unsupported action", description: "the user asked for something the agent cannot do" },
  { slug: "ambiguous_request", name: "Ambiguous request", description: "the request is too unclear to act on" },
  { slug: "tool_failure", name: "Tool failure", description: "a tool ran and failed" },
  { slug: "insufficient_context", name: "Insufficient context", description: "there is not enough conversation context to answer" },
];

export const PROJECT_ANALYTICS_ANSWERABLE_SEEDS: readonly AnalyticsOptionSeed[] = [
  { slug: "answerable", name: "Answerable", description: "the agent fully handled the request" },
  { slug: "unanswerable", name: "Unanswerable", description: "the agent could not handle the request" },
];

export const PROJECT_ANALYTICS_INTENT_SEEDS: readonly AnalyticsOptionSeed[] = [
  { slug: "get_help", name: "Get help", description: "the user wants help solving a problem" },
  { slug: "request_action", name: "Request action", description: "the user wants something done" },
  { slug: "check_status", name: "Check status", description: "the user is asking for a status or update" },
  { slug: "provide_information", name: "Provide information", description: "the user is giving information the agent asked for" },
  { slug: "other", name: "Other", description: "any other intent" },
];

export const PROJECT_ANALYTICS_OPTION_SEEDS: Record<
  AnalyticsOptionDimension,
  readonly AnalyticsOptionSeed[]
> = {
  category: PROJECT_ANALYTICS_CATEGORY_SEEDS,
  type: PROJECT_ANALYTICS_TYPE_SEEDS,
  gap: PROJECT_ANALYTICS_GAP_SEEDS,
  answerable: PROJECT_ANALYTICS_ANSWERABLE_SEEDS,
  intent: PROJECT_ANALYTICS_INTENT_SEEDS,
};

export interface AnalyticsCategoryInterface {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  dimension: AnalyticsOptionDimension;
  isSystem: boolean;
  /** Null for global system categories. */
  userId: Types.ObjectId | null;
  /** Null for global system categories. */
  apiKeyId: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

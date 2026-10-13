import type { Types } from "mongoose";

export const HOME_SECTION_TYPE_VALUES = [
  "goToChat",
  "latestNews",
  "faq",
  "linkCard",
] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPE_VALUES)[number];

export const DEFAULT_HOME_GREETING = "How can we help?";

export const WIDGET_MEDIA_TYPE_VALUES = [
  "logo",
  "homeBackground",
  "buttonBackground",
  "agentAvatar",
  "badge",
] as const;
export type WidgetMediaType = (typeof WIDGET_MEDIA_TYPE_VALUES)[number];

export const BUTTON_TEXT_ALIGN_VALUES = ["start", "center", "end"] as const;
export type ButtonTextAlign = (typeof BUTTON_TEXT_ALIGN_VALUES)[number];

export const WIDGET_ACCESS_MODE_VALUES = [
  "authenticated",
  "anonymous",
  "both",
] as const;
export type WidgetAccessMode = (typeof WIDGET_ACCESS_MODE_VALUES)[number];

export const VISITOR_JWT_ALGORITHM_VALUES = ["RS256", "ES256"] as const;
export type VisitorJwtAlgorithm =
  (typeof VISITOR_JWT_ALGORITHM_VALUES)[number];

export const DEFAULT_LOGIN_PROMPT_MESSAGE =
  "Log in to get a more personalized answer.";

export type WidgetLoginPrompt = {
  enabled: boolean;
  message: string;
  /** Optional URL; when set, the widget shows a login button that opens it. */
  loginLink: string;
};

export type HomeGoToChatElement = {
  id: string;
  type: "goToChat";
  label: string;
  subtitle?: string;
};

export type HomeLatestNewsElement = {
  id: string;
  type: "latestNews";
  title?: string;
  limit: number;
};

export type HomeFaqEntry = {
  articleId: string;
  /** Empty = all topics for the article. */
  topicIds: string[];
};

export type HomeFaqElement = {
  id: string;
  type: "faq";
  title?: string;
  /** Show a search field above the article list (default true). */
  enableSearch?: boolean;
  searchPlaceholder?: string;
  entries: HomeFaqEntry[];
};

export type HomeLinkCardElement = {
  id: string;
  type: "linkCard";
  title?: string;
  label: string;
  url: string;
  openInNewTab?: boolean;
};

/** Stacked home sections (array order = display order). */
export type HomeSectionElement =
  | HomeGoToChatElement
  | HomeLatestNewsElement
  | HomeFaqElement
  | HomeLinkCardElement;

export interface WidgetSectionSettings {
  enabled: boolean;
}

export interface WidgetFaqSettings {
  enabled: boolean;
  title?: string;
  /** Show a search field above the article list (default true). */
  enableSearch?: boolean;
  searchPlaceholder?: string;
  entries: HomeFaqEntry[];
}

export interface WidgetChatSettings {
  enabled: boolean;
  initialQuestions: string[];
  enableFollowupQuestions: boolean;
  /** Widget media id (empty if none). */
  agentProfilePicture: string;
  agentDescription: string;
  agentInitialMessage: string;
  agentName: string;
}

export interface WidgetHomeSettings {
  enabled: boolean;
  /** GridFS media id (empty if none). */
  logo: string;
  /** Fixed greeting under the logo. */
  greeting: string;
  /** Optional CSS hex color for the greeting (#RGB or #RRGGBB). */
  greetingColor?: string;
  /** GridFS media id (empty if none). */
  backgroundImage: string;
  /** Black overlay opacity over background image (0–100). */
  backgroundDim: number;
  elements: HomeSectionElement[];
}

export interface WidgetInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  publicKey: string;
  enabled: boolean;
  darkMode: boolean;
  /** Launcher FAB image (GridFS media id). Shown uncropped   shape follows the asset. */
  badgeImage: string;
  /**
   * Who may use the public embed: signed-in visitors only, guests only, or either.
   * Legacy Mongo field `authentication` ("any") is mapped to `both` in the service layer.
   */
  accessMode: WidgetAccessMode;
  loginPrompt: WidgetLoginPrompt;
  /** Public key PEM used to verify customer-issued visitor JWTs (RS256/ES256). */
  visitorJwtPublicKeyPem: string;
  visitorJwtAlgorithm: VisitorJwtAlgorithm;
  /** Expected `iss` claim on visitor JWTs. */
  visitorJwtIssuer: string;
  allowedDomains: string[];
  homeSettings: WidgetHomeSettings;
  chatSettings: WidgetChatSettings;
  faqSettings: WidgetFaqSettings;
  newsSettings: WidgetSectionSettings;
  createdAt: Date;
  updatedAt: Date;
}

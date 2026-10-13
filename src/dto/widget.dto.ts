import type {
  HomeSectionElement,
  VisitorJwtAlgorithm,
  WidgetAccessMode,
  WidgetFaqSettings,
  WidgetHomeSettings,
  WidgetLoginPrompt,
  WidgetMediaType,
  WidgetSectionSettings,
  WidgetChatSettings,
} from "../models/widget/widget.interface";
import {
  HOME_SECTION_TYPE_VALUES,
  VISITOR_JWT_ALGORITHM_VALUES,
  WIDGET_ACCESS_MODE_VALUES,
  WIDGET_MEDIA_TYPE_VALUES,
} from "../models/widget/widget.interface";
import type {
  PublicArticleDetailOutDto,
  PublicArticleTopicOutDto,
} from "./article.dto";

export type { PublicArticleDetailOutDto, PublicArticleTopicOutDto };

export type WidgetSectionSettingsDto = WidgetSectionSettings;
export type WidgetFaqSettingsDto = WidgetFaqSettings;
export type WidgetChatSettingsDto = WidgetChatSettings;
export type WidgetHomeSettingsDto = WidgetHomeSettings;
export type HomeSectionElementDto = HomeSectionElement;
export type WidgetLoginPromptDto = WidgetLoginPrompt;

export interface WidgetOutDto {
  id: string;
  apiKeyId: string;
  publicKey: string;
  enabled: boolean;
  darkMode: boolean;
  badgeImage: string;
  accessMode: WidgetAccessMode;
  loginPrompt: WidgetLoginPromptDto;
  visitorJwtPublicKeyPem: string;
  visitorJwtAlgorithm: VisitorJwtAlgorithm;
  visitorJwtIssuer: string;
  visitorAuthConfigured: boolean;
  allowedDomains: string[];
  homeSettings: WidgetHomeSettingsDto;
  chatSettings: WidgetChatSettingsDto;
  faqSettings: WidgetFaqSettingsDto;
  newsSettings: WidgetSectionSettingsDto;
  createdAt: string;
  updatedAt: string;
}

/** Public embed payload   no ownership fields, no PEM. */
export interface PublicWidgetOutDto {
  publicKey: string;
  enabled: boolean;
  darkMode: boolean;
  badgeImage: string;
  accessMode: WidgetAccessMode;
  loginPrompt: WidgetLoginPromptDto;
  visitorAuthConfigured: boolean;
  visitorJwtAlgorithm: VisitorJwtAlgorithm;
  visitorJwtIssuer: string;
  allowedDomains: string[];
  homeSettings: WidgetHomeSettingsDto;
  chatSettings: WidgetChatSettingsDto;
  faqSettings: WidgetFaqSettingsDto;
  newsSettings: WidgetSectionSettingsDto;
}

export interface UpdateWidgetDto {
  enabled?: boolean;
  darkMode?: boolean;
  badgeImage?: string;
  accessMode?: WidgetAccessMode;
  loginPrompt?: Partial<WidgetLoginPromptDto>;
  visitorJwtPublicKeyPem?: string;
  visitorJwtAlgorithm?: VisitorJwtAlgorithm;
  visitorJwtIssuer?: string;
  allowedDomains?: string[];
  homeSettings?: WidgetHomeSettingsDto;
  chatSettings?: Partial<WidgetChatSettingsDto>;
  faqSettings?: Partial<WidgetFaqSettingsDto>;
  newsSettings?: Partial<WidgetSectionSettingsDto>;
}

export interface WidgetMediaOutDto {
  mediaId: string;
  type: WidgetMediaType;
  url: string;
}

export interface PublicFaqTopicOutDto {
  id: string;
  topicName: string;
  enabled: boolean;
}

export interface PublicFaqArticleOutDto {
  id: string;
  title: string;
  enabled: boolean;
  topics: PublicFaqTopicOutDto[];
}

export interface PublicFaqContentOutDto {
  articles: PublicFaqArticleOutDto[];
}

export interface ChatSessionVisitorOutDto {
  sub: string;
  claims: Record<string, unknown>;
}

export interface ChatSessionOutDto {
  id: string;
  expiredAt: string;
  visitorAuthMode: "anonymous" | "authenticated";
  visitor: ChatSessionVisitorOutDto | null;
  /** ISO expiry of the bound visitor JWT; null when anonymous. */
  tokenExp: string | null;
}

export interface PublicChatMessageOutDto {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface PublicChatMessagesOutDto {
  messages: PublicChatMessageOutDto[];
}

export interface CreatePublicChatSessionDto {
  visitorToken?: string;
}

export interface BindVisitorIdentityDto {
  visitorToken: string;
}

export type {
  HomeSectionElement,
  VisitorJwtAlgorithm,
  WidgetAccessMode,
  WidgetLoginPrompt,
  WidgetMediaType,
};

export {
  HOME_SECTION_TYPE_VALUES,
  VISITOR_JWT_ALGORITHM_VALUES,
  WIDGET_ACCESS_MODE_VALUES,
  WIDGET_MEDIA_TYPE_VALUES,
};

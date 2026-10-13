import crypto from "crypto";
import type { Response } from "express";
import { Types } from "mongoose";
import type {
  ChatSessionOutDto,
  PublicArticleDetailOutDto,
  PublicChatMessagesOutDto,
  PublicFaqContentOutDto,
  PublicWidgetOutDto,
  UpdateWidgetDto,
  WidgetChatSettingsDto,
  WidgetFaqSettingsDto,
  WidgetHomeSettingsDto,
  WidgetMediaOutDto,
  WidgetOutDto,
  WidgetSectionSettingsDto,
} from "../../dto/widget.dto";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { ArticleModel } from "../../models/article/article.model";
import type { ArticleInterface } from "../../models/article/article.interface";
import { ChatSessionModel } from "../../models/chatSession/chatSession.model";
import type {
  ChatSessionInterface,
  ChatSessionVisitor,
} from "../../models/chatSession/chatSession.interface";
import type { ChatMessageInterface } from "../../models/message/message.interface";
import { ChatMessageModel } from "../../models/message/message.model";
import { TopicModel } from "../../models/topic/topic.model";
import type { TopicInterface } from "../../models/topic/topic.interface";
import type {
  VisitorJwtAlgorithm,
  WidgetAccessMode,
  WidgetChatSettings,
  WidgetFaqSettings,
  WidgetHomeSettings,
  WidgetInterface,
  WidgetLoginPrompt,
  WidgetMediaType,
  WidgetSectionSettings,
} from "../../models/widget/widget.interface";
import {
  DEFAULT_LOGIN_PROMPT_MESSAGE,
  WIDGET_MEDIA_TYPE_VALUES,
} from "../../models/widget/widget.interface";
import Widget from "../../models/widget/widget.model";
import { textFromMessage } from "../agent/agent.messages";
import {
  findLiveAgentFile,
  openLiveAgentDownload,
} from "../../buckets/liveAgentBucket";
import {
  deleteAllWidgetFilesForApiKey,
  deleteWidgetFileIfExists,
  findOwnedWidgetFile,
  findWidgetFile,
  openWidgetDownload,
  uploadWidgetFile,
} from "../../buckets/widgetBucket";
import {
  signPublicSessionId,
  tryVerifyPublicSessionId,
  verifyPublicSessionId,
} from "../../utils/publicSessionToken";
import {
  verifyVisitorJwt,
  visitorJwtAudience,
} from "../../utils/visitorJwt";
import {
  coerceChatSettings,
  coerceFaqSettings,
  coerceHomeSettings,
  defaultChatSettings,
  defaultFaqSettings,
  defaultHomeSettings,
} from "../../validation/widget";
import { articleService } from "../article/article.service";
import { entitlementService } from "../entitlement/entitlement.service";
import { widgetAnalyticsService } from "../widgetAnalytics/widgetAnalytics.service";

export const MAX_WIDGET_MEDIA_BYTES = 5 * 1024 * 1024;
const PUBLIC_CHAT_HISTORY_LIMIT = 40;
/** Default / sliding chat-session window (matches ChatSessionModel default). */
export const CHAT_SESSION_TTL_MS = 30 * 60 * 1000;

type WidgetDoc = WidgetInterface & {
  _id: Types.ObjectId;
  /** Legacy field from older documents */
  authentication?: string;
};
type ArticleDoc = ArticleInterface & { _id: Types.ObjectId };
type TopicDoc = TopicInterface & { _id: Types.ObjectId };
type ChatSessionDoc = ChatSessionInterface;

function resolveAccessMode(doc: WidgetDoc): WidgetAccessMode {
  if (doc.accessMode) return doc.accessMode;
  const legacy = doc.authentication;
  if (legacy === "any") return "both";
  if (legacy === "authenticated" || legacy === "anonymous") return legacy;
  return "both";
}

function resolveLoginPrompt(doc: WidgetDoc): WidgetLoginPrompt {
  return {
    enabled: doc.loginPrompt?.enabled ?? false,
    message:
      doc.loginPrompt?.message?.trim() || DEFAULT_LOGIN_PROMPT_MESSAGE,
    loginLink: doc.loginPrompt?.loginLink?.trim() || "",
  };
}

function resolveVisitorJwtAlgorithm(doc: WidgetDoc): VisitorJwtAlgorithm {
  return doc.visitorJwtAlgorithm === "ES256" ? "ES256" : "RS256";
}

function isVisitorAuthConfigured(doc: WidgetDoc): boolean {
  return Boolean(
    doc.visitorJwtPublicKeyPem?.trim() && doc.visitorJwtIssuer?.trim(),
  );
}

function toChatSessionOutDto(doc: ChatSessionDoc): ChatSessionOutDto {
  const visitor =
    doc.visitorAuthMode === "authenticated" && doc.visitor
      ? { sub: doc.visitor.sub, claims: doc.visitor.claims ?? {} }
      : null;
  const tokenExp =
    doc.visitorAuthMode === "authenticated" && doc.visitor?.tokenExp
      ? doc.visitor.tokenExp.toISOString()
      : null;
  return {
    id: doc._id.toString(),
    expiredAt: doc.expiredAt.toISOString(),
    visitorAuthMode: doc.visitorAuthMode ?? "anonymous",
    visitor,
    tokenExp,
  };
}

function toPublicChatSessionOutDto(doc: ChatSessionDoc): ChatSessionOutDto {
  const dto = toChatSessionOutDto(doc);
  return {
    ...dto,
    id: signPublicSessionId(doc.publicKey, dto.id),
  };
}

function defaultSessionExpiredAt(fromMs = Date.now()): Date {
  return new Date(fromMs + CHAT_SESSION_TTL_MS);
}

/** Session clock covers at least the visitor JWT lifetime when authenticated. */
function alignExpiredAtWithVisitor(
  currentOrDefault: Date,
  visitor: ChatSessionVisitor | null,
): Date {
  if (!visitor?.tokenExp) return currentOrDefault;
  const tokenMs = visitor.tokenExp.getTime();
  return tokenMs > currentOrDefault.getTime()
    ? new Date(tokenMs)
    : currentOrDefault;
}

/**
 * Sliding TTL after activity: now+30m, and never shorter than remaining tokenExp
 * while the visitor JWT is still valid.
 */
function nextSlidingExpiredAt(session: ChatSessionDoc): Date {
  const base = defaultSessionExpiredAt();
  if (
    session.visitorAuthMode === "authenticated" &&
    session.visitor?.tokenExp &&
    session.visitor.tokenExp.getTime() > Date.now()
  ) {
    return alignExpiredAtWithVisitor(base, session.visitor);
  }
  return base;
}

function tabOrDefault(
  section: WidgetSectionSettings | undefined,
): WidgetSectionSettingsDto {
  return { enabled: section?.enabled ?? true };
}

function faqOrDefault(
  section: WidgetFaqSettings | undefined,
): WidgetFaqSettingsDto {
  return coerceFaqSettings(section ?? defaultFaqSettings());
}

function chatOrDefault(
  section: WidgetChatSettings | undefined,
): WidgetChatSettingsDto {
  return coerceChatSettings(section ?? defaultChatSettings());
}

function homeOrDefault(
  section: WidgetHomeSettings | undefined,
): WidgetHomeSettingsDto {
  return coerceHomeSettings(section ?? defaultHomeSettings());
}

function toWidgetOutDto(doc: WidgetDoc): WidgetOutDto {
  const pem = doc.visitorJwtPublicKeyPem ?? "";
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    publicKey: doc.publicKey,
    enabled: doc.enabled,
    darkMode: doc.darkMode ?? false,
    badgeImage: doc.badgeImage ?? "",
    accessMode: resolveAccessMode(doc),
    loginPrompt: resolveLoginPrompt(doc),
    visitorJwtPublicKeyPem: pem,
    visitorJwtAlgorithm: resolveVisitorJwtAlgorithm(doc),
    visitorJwtIssuer: doc.visitorJwtIssuer ?? "",
    visitorAuthConfigured: isVisitorAuthConfigured(doc),
    allowedDomains: doc.allowedDomains ?? [],
    homeSettings: homeOrDefault(doc.homeSettings),
    chatSettings: chatOrDefault(doc.chatSettings),
    faqSettings: faqOrDefault(doc.faqSettings),
    newsSettings: tabOrDefault(doc.newsSettings),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toPublicWidgetOutDto(doc: WidgetDoc): PublicWidgetOutDto {
  return {
    publicKey: doc.publicKey,
    enabled: doc.enabled,
    darkMode: doc.darkMode ?? false,
    badgeImage: doc.badgeImage ?? "",
    accessMode: resolveAccessMode(doc),
    loginPrompt: resolveLoginPrompt(doc),
    visitorAuthConfigured: isVisitorAuthConfigured(doc),
    visitorJwtAlgorithm: resolveVisitorJwtAlgorithm(doc),
    visitorJwtIssuer: doc.visitorJwtIssuer ?? "",
    allowedDomains: doc.allowedDomains ?? [],
    homeSettings: homeOrDefault(doc.homeSettings),
    chatSettings: chatOrDefault(doc.chatSettings),
    faqSettings: faqOrDefault(doc.faqSettings),
    newsSettings: tabOrDefault(doc.newsSettings),
  };
}

async function assertOwnedApiKey(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Promise<void> {
  const apiKey = await ApiKeyModel.findOne({ _id: apiKeyId }).lean();
  if (!apiKey) {
    throw new Error("API key not found");
  }
}

function parseWidgetMediaType(value: unknown): WidgetMediaType {
  if (
    typeof value !== "string" ||
    !(WIDGET_MEDIA_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `type must be one of: ${WIDGET_MEDIA_TYPE_VALUES.join(", ")}`,
    );
  }
  return value as WidgetMediaType;
}

function contentTypeOf(file: {
  metadata?: Record<string, unknown> | null;
}): string {
  const fromMeta =
    typeof file.metadata?.contentType === "string"
      ? file.metadata.contentType
      : undefined;
  return fromMeta ?? "application/octet-stream";
}

export class WidgetService {
  async getByPublicKey(publicKey: string): Promise<PublicWidgetOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetEmbedActive(
      doc.userId,
      doc.apiKeyId,
      doc,
    );

    return toPublicWidgetOutDto(doc);
  }

  async getFaqContent(publicKey: string): Promise<PublicFaqContentOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    const home = homeOrDefault(doc.homeSettings);
    const faq = faqOrDefault(doc.faqSettings);

    if (faq.enabled) {
      await entitlementService.assertWidgetFeatureActive(
        doc.userId,
        doc.apiKeyId,
        "help",
        doc,
      );
    } else if (home.enabled) {
      await entitlementService.assertWidgetFeatureActive(
        doc.userId,
        doc.apiKeyId,
        "home",
        doc,
      );
    } else {
      throw new Error("Help is not active");
    }

    const articleIds = new Set<string>();
    for (const element of home.elements) {
      if (element.type !== "faq") continue;
      for (const entry of element.entries) {
        articleIds.add(entry.articleId);
      }
    }
    for (const entry of faq.entries) {
      articleIds.add(entry.articleId);
    }

    if (articleIds.size === 0) {
      return { articles: [] };
    }

    const objectIds = [...articleIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const articles = await ArticleModel.find({
      _id: { $in: objectIds },
      apiKeyId: doc.apiKeyId,
      enabled: true,
    }).lean<ArticleDoc[]>();

    const topics = await TopicModel.find({
      articleId: { $in: objectIds },
      apiKeyId: doc.apiKeyId,
      enabled: true,
    })
      .sort({ order: 1 })
      .lean<TopicDoc[]>();

    const topicsByArticle = new Map<string, TopicDoc[]>();
    for (const topic of topics) {
      if (!topic.articleId) continue;
      const key = topic.articleId.toString();
      const list = topicsByArticle.get(key) ?? [];
      list.push(topic);
      topicsByArticle.set(key, list);
    }

    return {
      articles: articles.map((article) => {
        const id = article._id.toString();
        const articleTopics = topicsByArticle.get(id) ?? [];
        return {
          id,
          title: article.title,
          enabled: article.enabled,
          topics: articleTopics.map((topic) => ({
            id: topic._id.toString(),
            topicName: topic.topicName,
            enabled: topic.enabled,
          })),
        };
      }),
    };
  }

  async getPublicArticle(
    publicKey: string,
    articleId: string,
    ip: string,
  ): Promise<PublicArticleDetailOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetFeatureActive(
      doc.userId,
      doc.apiKeyId,
      "article",
      doc,
    );

    const data = await articleService.getPublicDetail(doc.apiKeyId, articleId);
    void widgetAnalyticsService.recordFaqView(
      doc.userId,
      doc.apiKeyId,
      data.id,
      ip,
    );
    return data;
  }

  async getOrCreate(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<WidgetOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);

    const existing = await Widget.findOne({ apiKeyId }).lean<WidgetDoc>();
    if (existing) {
      return toWidgetOutDto(existing);
    }

    const doc = await Widget.create({
      userId,
      apiKeyId,
      publicKey: crypto.randomBytes(16).toString("hex"),
      enabled: true,
      darkMode: false,
      badgeImage: "",
      accessMode: "both",
      loginPrompt: {
        enabled: false,
        message: DEFAULT_LOGIN_PROMPT_MESSAGE,
        loginLink: "",
      },
      visitorJwtPublicKeyPem: "",
      visitorJwtAlgorithm: "RS256",
      visitorJwtIssuer: "",
      allowedDomains: [],
      homeSettings: defaultHomeSettings(),
      chatSettings: defaultChatSettings(),
      faqSettings: defaultFaqSettings(),
      newsSettings: { enabled: true },
    });

    return toWidgetOutDto(doc.toObject() as WidgetDoc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    patch: UpdateWidgetDto,
  ): Promise<WidgetOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);

    const existing = await Widget.findOne({ apiKeyId }).lean<WidgetDoc>();
    if (!existing) {
      throw new Error("Widget not found");
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};

    if (patch.enabled !== undefined) $set.enabled = patch.enabled;
    if (patch.darkMode !== undefined) $set.darkMode = patch.darkMode;
    if (patch.badgeImage !== undefined) $set.badgeImage = patch.badgeImage;
    if (patch.accessMode !== undefined) {
      $set.accessMode = patch.accessMode;
      $unset.authentication = "";
    }
    if (patch.loginPrompt !== undefined) {
      if (patch.loginPrompt.enabled !== undefined) {
        $set["loginPrompt.enabled"] = patch.loginPrompt.enabled;
      }
      if (patch.loginPrompt.message !== undefined) {
        $set["loginPrompt.message"] = patch.loginPrompt.message;
      }
      if (patch.loginPrompt.loginLink !== undefined) {
        $set["loginPrompt.loginLink"] = patch.loginPrompt.loginLink;
      }
    }
    if (patch.visitorJwtPublicKeyPem !== undefined) {
      $set.visitorJwtPublicKeyPem = patch.visitorJwtPublicKeyPem;
    }
    if (patch.visitorJwtAlgorithm !== undefined) {
      $set.visitorJwtAlgorithm = patch.visitorJwtAlgorithm;
    }
    if (patch.visitorJwtIssuer !== undefined) {
      $set.visitorJwtIssuer = patch.visitorJwtIssuer;
    }
    if (patch.allowedDomains !== undefined) {
      $set.allowedDomains = patch.allowedDomains;
    }
    if (patch.homeSettings !== undefined) {
      $set.homeSettings = patch.homeSettings;
    }
    if (patch.chatSettings !== undefined) {
      const chat = patch.chatSettings;
      if (chat.enabled !== undefined) {
        $set["chatSettings.enabled"] = chat.enabled;
      }
      if (chat.initialQuestions !== undefined) {
        $set["chatSettings.initialQuestions"] = chat.initialQuestions;
      }
      if (chat.enableFollowupQuestions !== undefined) {
        $set["chatSettings.enableFollowupQuestions"] =
          chat.enableFollowupQuestions;
      }
      if (chat.agentProfilePicture !== undefined) {
        $set["chatSettings.agentProfilePicture"] = chat.agentProfilePicture;
      }
      if (chat.agentDescription !== undefined) {
        $set["chatSettings.agentDescription"] = chat.agentDescription;
      }
      if (chat.agentInitialMessage !== undefined) {
        $set["chatSettings.agentInitialMessage"] = chat.agentInitialMessage;
      }
      if (chat.agentName !== undefined) {
        $set["chatSettings.agentName"] = chat.agentName;
      }
    }
    if (patch.faqSettings) {
      const faq = patch.faqSettings;
      if (faq.enabled !== undefined) {
        $set["faqSettings.enabled"] = faq.enabled;
      }
      if (faq.title !== undefined) {
        $set["faqSettings.title"] = faq.title;
      }
      if (faq.enableSearch !== undefined) {
        $set["faqSettings.enableSearch"] = faq.enableSearch;
      }
      if (faq.searchPlaceholder !== undefined) {
        $set["faqSettings.searchPlaceholder"] = faq.searchPlaceholder;
      }
      if (faq.entries !== undefined) {
        $set["faqSettings.entries"] = faq.entries;
      }
    }
    if (patch.newsSettings?.enabled !== undefined) {
      $set["newsSettings.enabled"] = patch.newsSettings.enabled;
    }

    const updateOps: Record<string, unknown> = { $set };
    if (Object.keys($unset).length > 0) {
      updateOps.$unset = $unset;
    }

    const updated = await Widget.findOneAndUpdate(
      { _id: existing._id, apiKeyId },
      updateOps,
      { new: true },
    ).lean<WidgetDoc>();

    if (!updated) {
      throw new Error("Widget not found");
    }

    return toWidgetOutDto(updated);
  }

  async uploadHomeMedia(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    typeRaw: unknown,
    file: Express.Multer.File | undefined,
  ): Promise<WidgetMediaOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);
    const type = parseWidgetMediaType(typeRaw);

    if (!file) {
      throw new Error("file is required");
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Only images allowed");
    }
    if (file.size > MAX_WIDGET_MEDIA_BYTES) {
      throw new Error("Image must be 5MB or smaller");
    }
    if (type === "buttonBackground") {
      throw new Error("buttonBackground uploads are not supported");
    }
    if (type === "badge") {
      const allowed = new Set([
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
      ]);
      if (!allowed.has(file.mimetype.toLowerCase())) {
        throw new Error("Badge must be PNG, JPG, or GIF");
      }
    }

    const existing = await Widget.findOne({ apiKeyId }).lean<WidgetDoc>();
    if (!existing) {
      throw new Error("Widget not found");
    }

    const home = homeOrDefault(existing.homeSettings);
    const chat = chatOrDefault(existing.chatSettings);
    let previousId = "";
    if (type === "logo") {
      previousId = home.logo;
    } else if (type === "homeBackground") {
      previousId = home.backgroundImage;
    } else if (type === "agentAvatar") {
      previousId = chat.agentProfilePicture;
    } else if (type === "badge") {
      previousId = existing.badgeImage ?? "";
    }

    const uploaded = await uploadWidgetFile({
      buffer: file.buffer,
      filename: file.originalname || `${type}.bin`,
      contentType: file.mimetype,
      metadata: { type, userId, apiKeyId },
    });

    const mediaId = uploaded.id.toString();

    if (type === "logo" || type === "homeBackground") {
      const nextHome: WidgetHomeSettings = {
        ...home,
        ...(type === "logo"
          ? { logo: mediaId }
          : { backgroundImage: mediaId }),
      };
      await Widget.updateOne(
        { _id: existing._id },
        { $set: { homeSettings: nextHome } },
      );
    } else if (type === "agentAvatar") {
      await Widget.updateOne(
        { _id: existing._id },
        { $set: { "chatSettings.agentProfilePicture": mediaId } },
      );
    } else if (type === "badge") {
      await Widget.updateOne(
        { _id: existing._id },
        { $set: { badgeImage: mediaId } },
      );
    }

    if (previousId && previousId !== mediaId) {
      await deleteWidgetFileIfExists(previousId);
    }

    return {
      mediaId,
      type,
      url: `/widgets/media/${mediaId}?apiKeyId=${apiKeyId.toString()}`,
    };
  }

  async streamOwnedMedia(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    mediaId: string,
    res: Response,
  ): Promise<void> {
    await assertOwnedApiKey(userId, apiKeyId);

    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Media not found");
    }

    const file = await findOwnedWidgetFile(mediaId, userId, apiKeyId);
    if (!file) {
      throw new Error("Media not found");
    }

    res.setHeader("Content-Type", contentTypeOf(file));
    res.setHeader("Cache-Control", "private, max-age=3600");
    openWidgetDownload(mediaId).pipe(res);
  }

  async streamPublicMedia(
    publicKey: string,
    mediaId: string,
    res: Response,
  ): Promise<void> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }
    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Media not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetEmbedActive(
      doc.userId,
      doc.apiKeyId,
      doc,
    );

    const file = await findWidgetFile(mediaId);
    if (!file) {
      throw new Error("Media not found");
    }

    const fileApiKeyId = file.metadata?.apiKeyId;
    const matches =
      fileApiKeyId instanceof Types.ObjectId
        ? fileApiKeyId.equals(doc.apiKeyId)
        : String(fileApiKeyId) === doc.apiKeyId.toString();

    if (!matches) {
      throw new Error("Media not found");
    }

    res.setHeader("Content-Type", contentTypeOf(file));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    openWidgetDownload(mediaId).pipe(res);
  }

  async streamPublicLiveAgentMedia(
    publicKey: string,
    mediaId: string,
    res: Response,
  ): Promise<void> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }
    if (!Types.ObjectId.isValid(mediaId)) {
      throw new Error("Media not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetEmbedActive(
      doc.userId,
      doc.apiKeyId,
      doc,
    );

    const file = await findLiveAgentFile(mediaId);
    if (!file) {
      throw new Error("Media not found");
    }

    const fileApiKeyId = file.metadata?.apiKeyId;
    const matches =
      fileApiKeyId instanceof Types.ObjectId
        ? fileApiKeyId.equals(doc.apiKeyId)
        : String(fileApiKeyId) === doc.apiKeyId.toString();

    if (!matches) {
      throw new Error("Media not found");
    }

    res.setHeader("Content-Type", contentTypeOf(file));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    openLiveAgentDownload(mediaId).pipe(res);
  }

  async streamPublicArticleMedia(
    publicKey: string,
    mediaId: string,
    res: Response,
  ): Promise<void> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetFeatureActive(
      doc.userId,
      doc.apiKeyId,
      "article",
      doc,
    );

    const { contentType, stream } = await articleService.getPublicMediaStream(
      doc.apiKeyId,
      mediaId,
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    stream.pipe(res);
  }


  //ANCHOR : session begining

  private verifyVisitorForWidget(
    widget: WidgetDoc,
    visitorToken: string,
  ): ChatSessionVisitor {
    const verified = verifyVisitorJwt(visitorToken, {
      publicKeyPem: widget.visitorJwtPublicKeyPem ?? "",
      algorithm: resolveVisitorJwtAlgorithm(widget),
      issuer: widget.visitorJwtIssuer ?? "",
      audience: visitorJwtAudience(widget.publicKey),
    });
    return {
      sub: verified.sub,
      claims: verified.claims,
      iss: verified.iss,
      verifiedAt: new Date(),
      tokenExp: verified.tokenExp,
    };
  }

  private assertVisitorTokenAllowed(
    accessMode: WidgetAccessMode,
    hasToken: boolean,
  ): void {
    if (accessMode === "anonymous" && hasToken) {
      throw new Error("Visitor tokens are not accepted in anonymous access mode");
    }
    if (accessMode === "authenticated" && !hasToken) {
      throw new Error("Visitor authentication required");
    }
  }

  /**
   * Shared visitor/session auth gate for public read + chat paths.
   * Assumes session.expiredAt has already been checked.
   */
  private assertPublicSessionVisitorGate(
    widget: WidgetDoc,
    session: ChatSessionDoc,
  ): void {
    const accessMode = resolveAccessMode(widget);
    const visitorValid =
      session.visitorAuthMode === "authenticated" &&
      session.visitor != null &&
      session.visitor.tokenExp.getTime() > Date.now();

    if (accessMode === "authenticated" && !visitorValid) {
      throw new Error("Visitor authentication required");
    }

    if (
      session.visitorAuthMode === "authenticated" &&
      session.visitor &&
      session.visitor.tokenExp.getTime() <= Date.now()
    ) {
      throw new Error("Visitor token expired");
    }
  }

  private async loadPublicChatSession(
    publicKey: string,
    sessionId: string,
  ): Promise<{ widget: WidgetDoc; session: ChatSessionDoc }> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }
    const canonicalSessionId = verifyPublicSessionId(trimmed, sessionId);

    const widget = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!widget || !widget.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetFeatureActive(
      widget.userId,
      widget.apiKeyId,
      "chat",
      widget,
    );

    const session = await ChatSessionModel.findOne({
      _id: canonicalSessionId,
      publicKey: trimmed,
    }).lean<ChatSessionDoc>();

    if (!session) {
      throw new Error("Chat session not found");
    }

    if (session.expiredAt.getTime() <= Date.now()) {
      await ChatSessionModel.deleteOne({ _id: session._id });
      throw new Error("Chat session expired");
    }

    this.assertPublicSessionVisitorGate(widget, session);
    return { widget, session };
  }

  /**
   * Enforce accessMode before streaming chat on a public widget session.
   */
  async assertPublicSessionCanChat(
    publicKey: string,
    sessionId: string,
  ): Promise<ChatSessionDoc> {
    const { session } = await this.loadPublicChatSession(publicKey, sessionId);
    return session;
  }

  /**
   * Sliding-extend public chat session after a successful AI turn.
   * Returns the updated expiredAt (ISO) when extended.
   */
  async extendPublicChatSessionAfterActivity(
    publicKey: string,
    sessionId: string,
  ): Promise<string | null> {
    const trimmed = publicKey.trim();
    const canonicalSessionId = trimmed
      ? tryVerifyPublicSessionId(trimmed, sessionId)
      : null;
    if (!trimmed || !canonicalSessionId) {
      return null;
    }

    const session = await ChatSessionModel.findOne({
      _id: canonicalSessionId,
      publicKey: trimmed,
    });
    if (!session) return null;
    if (session.expiredAt.getTime() <= Date.now()) return null;

    const next = nextSlidingExpiredAt(session);
    if (next.getTime() <= session.expiredAt.getTime()) {
      return session.expiredAt.toISOString();
    }

    session.expiredAt = next;
    await session.save();
    return session.expiredAt.toISOString();
  }

  async createChatSession(
    publicKey: string,
    options?: { visitorToken?: string },
  ): Promise<ChatSessionOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }

    const doc = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!doc || !doc.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetFeatureActive(
      doc.userId,
      doc.apiKeyId,
      "chat",
      doc,
    );

    const accessMode = resolveAccessMode(doc);
    const visitorToken = options?.visitorToken?.trim();
    this.assertVisitorTokenAllowed(accessMode, Boolean(visitorToken));

    let visitor: ChatSessionVisitor | null = null;
    let visitorAuthMode: "anonymous" | "authenticated" = "anonymous";

    if (visitorToken) {
      visitor = this.verifyVisitorForWidget(doc, visitorToken);
      visitorAuthMode = "authenticated";
    }

    const expiredAt = alignExpiredAtWithVisitor(
      defaultSessionExpiredAt(),
      visitor,
    );

    const session = await ChatSessionModel.create({
      publicKey: trimmed,
      userId: doc.userId,
      apiKeyId: doc.apiKeyId,
      visitorAuthMode,
      visitor,
      expiredAt,
    });

    return toPublicChatSessionOutDto(session);
  }

  async bindVisitorIdentity(
    publicKey: string,
    sessionId: string,
    visitorToken: string,
  ): Promise<ChatSessionOutDto> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }
    const canonicalSessionId = verifyPublicSessionId(trimmed, sessionId);

    const widget = await Widget.findOne({ publicKey: trimmed }).lean<WidgetDoc>();
    if (!widget || !widget.enabled) {
      throw new Error("Widget not found");
    }

    await entitlementService.assertWidgetFeatureActive(
      widget.userId,
      widget.apiKeyId,
      "chat",
      widget,
    );

    const accessMode = resolveAccessMode(widget);
    if (accessMode === "anonymous") {
      throw new Error("Visitor tokens are not accepted in anonymous access mode");
    }

    const session = await ChatSessionModel.findOne({
      _id: canonicalSessionId,
      publicKey: trimmed,
    });

    if (!session) {
      throw new Error("Chat session not found");
    }

    if (session.expiredAt.getTime() <= Date.now()) {
      await ChatSessionModel.deleteOne({ _id: session._id });
      throw new Error("Chat session expired");
    }

    const visitor = this.verifyVisitorForWidget(widget, visitorToken);
    session.visitorAuthMode = "authenticated";
    session.visitor = visitor;
    session.expiredAt = alignExpiredAtWithVisitor(session.expiredAt, visitor);
    await session.save();

    return toPublicChatSessionOutDto(session);
  }

  /**
   * Bind a visitor JWT to an owner-created train/test chat session.
   * Skips widget accessMode gate so developers can test visitor identity
   * even when the widget is configured for anonymous public access.
   */
  async bindOwnedVisitorIdentity(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionId: string,
    visitorToken: string,
  ): Promise<ChatSessionOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new Error("Chat session not found");
    }

    const widget = await Widget.findOne({ apiKeyId }).lean<WidgetDoc>();
    if (!widget) {
      throw new Error("Widget not found");
    }

    const session = await ChatSessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      apiKeyId,
    });

    if (!session) {
      throw new Error("Chat session not found");
    }

    if (session.expiredAt.getTime() <= Date.now()) {
      await ChatSessionModel.deleteOne({ _id: session._id });
      throw new Error("Chat session expired");
    }

    if (!isVisitorAuthConfigured(widget)) {
      throw new Error(
        "Visitor authentication is not configured for this widget",
      );
    }

    const visitor = this.verifyVisitorForWidget(widget, visitorToken);
    session.visitorAuthMode = "authenticated";
    session.visitor = visitor;
    session.expiredAt = alignExpiredAtWithVisitor(session.expiredAt, visitor);
    await session.save();

    return toChatSessionOutDto(session);
  }

  // Session lookup still requires chat to be active for the embed.
  async getChatSession(
    publicKey: string,
    sessionId: string,
  ): Promise<ChatSessionOutDto> {
    const { session } = await this.loadPublicChatSession(publicKey, sessionId);
    return toPublicChatSessionOutDto(session);
  }

  async listPublicChatMessages(
    publicKey: string,
    sessionId: string,
  ): Promise<PublicChatMessagesOutDto> {
    const { session } = await this.loadPublicChatSession(publicKey, sessionId);

    const docs = await ChatMessageModel.find({
      sessionId: session._id,
      role: { $in: ["user", "assistant"] },
    })
      .sort({ createdAt: 1 })
      .limit(PUBLIC_CHAT_HISTORY_LIMIT)
      .lean<ChatMessageInterface[]>();

    const messages = docs
      .map((doc) => {
        const text = textFromMessage(doc).trim();
        if (!text) return null;
        if (doc.role !== "user" && doc.role !== "assistant") return null;
        return {
          id: doc._id.toString(),
          role: doc.role,
          text,
          createdAt: doc.createdAt.toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return { messages };
  }

  async deleteChatSession(
    publicKey: string,
    sessionId: string,
  ): Promise<void> {
    const trimmed = publicKey.trim();
    if (!trimmed) {
      throw new Error("Widget not found");
    }
    const canonicalSessionId = tryVerifyPublicSessionId(trimmed, sessionId);
    if (!canonicalSessionId) {
      return;
    }

    await ChatSessionModel.deleteOne({
      _id: canonicalSessionId,
      publicKey: trimmed,
    });
  }

  async createOwnedChatSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<ChatSessionOutDto> {
    const widget = await this.getOrCreate(userId, apiKeyId);

    const session = await ChatSessionModel.create({
      publicKey: widget.publicKey,
      userId,
      apiKeyId,
      visitorAuthMode: "anonymous",
      visitor: null,
    });

    return toChatSessionOutDto(session);
  }

  async getOwnedChatSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionId: string,
  ): Promise<ChatSessionOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new Error("Chat session not found");
    }

    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      apiKeyId,
    }).lean<ChatSessionDoc>();

    if (!session) {
      throw new Error("Chat session not found");
    }

    if (session.expiredAt.getTime() <= Date.now()) {
      await ChatSessionModel.deleteOne({ _id: session._id });
      throw new Error("Chat session expired");
    }

    return toChatSessionOutDto(session);
  }

  async deleteOwnedChatSession(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    sessionId: string,
  ): Promise<void> {
    await assertOwnedApiKey(userId, apiKeyId);

    if (!Types.ObjectId.isValid(sessionId)) {
      return;
    }

    await ChatSessionModel.deleteOne({
      _id: sessionId,
      apiKeyId,
    });
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await Widget.deleteMany({ apiKeyId });
    await deleteAllWidgetFilesForApiKey(apiKeyId);
  }
}

export const widgetService = new WidgetService();

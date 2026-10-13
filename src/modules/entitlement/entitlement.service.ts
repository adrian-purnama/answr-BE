import { Types } from "mongoose";
import { shouldUseDeepseek as checkDeepseekQuota } from "../../llm/deepseek/deepseekQuota";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import { ArticleModel } from "../../models/article/article.model";
import { TopicModel } from "../../models/topic/topic.model";
import {
  assertApiKeyActive,
  ApiKeyInactiveError,
} from "../../utils/apiKeyStatus";
import { userService } from "../user/user.service";
import { GuidanceModel } from "../../models/guidance/guidance.model";
import { LiveAgentModel } from "../../models/liveAgent/liveAgent.model";
import { MeetingTopicModel } from "../../models/meetingTool/meetingTool.model";
import { BatchTestGroupModel } from "../../models/batchTest/batchTestGroup.model";
import { BatchTestQuestionModel } from "../../models/batchTest/batchTestQuestion.model";

export const WIDGET_FEATURE_VALUES = [
  "home",
  "chat",
  "help",
  "article",
] as const;
export type WidgetFeature = (typeof WIDGET_FEATURE_VALUES)[number];

/** Minimal widget shape needed to gate public embed features. */
export type WidgetFeatureGate = {
  enabled: boolean;
  homeSettings?: { enabled?: boolean } | null;
  chatSettings?: { enabled?: boolean } | null;
  faqSettings?: { enabled?: boolean } | null;
};

class EntitlementService {
  constructor() {}

  async canCreateApiKey(userId: Types.ObjectId): Promise<boolean> {
    const plan = await userService.getUserPlan(userId);
    if (!plan) {
      return false;
    }

    const apiKeys = await ApiKeyModel.countDocuments({
      userId,
      "status.status": { $ne: "revoked" },
    });
    if (apiKeys >= plan.maxApiKeys) {
      return false;
    }
    return true;
  }

  /** Whether the owner may use DeepSeek for this turn (API key + plan period quota). */
  async shouldUseDeepseek(userId: Types.ObjectId): Promise<boolean> {
    return checkDeepseekQuota(userId);
  }

  /**
   * Reject public widget requests when the widget, API key, or matching
   * section is not active.
   */
  async assertWidgetFeatureActive(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    feature: WidgetFeature,
    widget: WidgetFeatureGate,
  ): Promise<void> {
    await this.assertWidgetEmbedActive(userId, apiKeyId, widget);

    const homeEnabled = widget.homeSettings?.enabled ?? true;
    const chatEnabled = widget.chatSettings?.enabled ?? true;
    const helpEnabled = widget.faqSettings?.enabled ?? true;

    switch (feature) {
      case "home":
        if (!homeEnabled) {
          throw new Error("Home is not active");
        }
        return;
      case "chat":
        if (!chatEnabled) {
          throw new Error("Chat is not active");
        }
        return;
      case "help":
        if (!helpEnabled) {
          throw new Error("Help is not active");
        }
        return;
      case "article":
        if (!homeEnabled && !helpEnabled) {
          throw new Error("Articles are not available");
        }
        return;
      default: {
        const _exhaustive: never = feature;
        throw new Error(`Unknown widget feature: ${_exhaustive}`);
      }
    }
  }

  /** Widget embed shell: widget must be on and the owning API key active. */
  async assertWidgetEmbedActive(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    widget: Pick<WidgetFeatureGate, "enabled">,
  ): Promise<void> {
    await this.assertActiveApiKey(userId, apiKeyId);

    if (!widget.enabled) {
      throw new Error("Widget is not active");
    }
  }

  async canCreateArticle(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await ArticleModel.countDocuments({ apiKeyId });
    return count < (plan.maxArticles ?? 10);
  }

  async canCreateTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: Types.ObjectId,
  ): Promise<boolean> {
    await this.assertActiveApiKey(userId, apiKeyId);

    const article = await ArticleModel.findOne({
      _id: articleId,
      apiKeyId,
    }).lean();
    if (!article) {
      throw new Error("Article not found");
    }

    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await TopicModel.countDocuments({
      articleId,
      apiKeyId,
    });
    return count < (plan.maxTopicsPerArticle ?? 50);
  }

  /** Whether `additionalCount` topics can be added (new article or existing). */
  async canCreateTopicsBatch(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    articleId: Types.ObjectId | null,
    additionalCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const limit = plan.maxTopicsPerArticle ?? 50;
    if (additionalCount < 0) {
      return false;
    }

    if (!articleId) {
      return additionalCount <= limit;
    }

    const article = await ArticleModel.findOne({
      _id: articleId,
      apiKeyId,
    }).lean();
    if (!article) {
      throw new Error("Article not found");
    }

    const count = await TopicModel.countDocuments({
      articleId,
      apiKeyId,
    });
    return count + additionalCount <= limit;
  }

  /**
   * Whether a topic may have `nextImageCount` image blocks after create/update/import.
   * topicId is reserved for future per-topic checks; currently only plan cap is applied.
   */
  async canAddImagesToTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    _articleId: Types.ObjectId,
    _topicId: Types.ObjectId | null,
    nextImageCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    if (nextImageCount < 0) {
      return false;
    }

    return nextImageCount <= (plan.maxImagesPerTopic ?? 10);
  }

  /**
   * Whether a topic may have `nextCharacterCount` text characters after create/update/import.
   */
  async canAddCharactersToTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    _articleId: Types.ObjectId,
    _topicId: Types.ObjectId | null,
    nextCharacterCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    if (nextCharacterCount < 0) {
      return false;
    }

    return nextCharacterCount <= (plan.maxCharactersPerTopic ?? 10000);
  }

  async canCreateGuidance(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await GuidanceModel.countDocuments({ apiKeyId });
    return count < (plan.maxGuidances ?? 10);
  }

  async canCreateLiveAgent(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan || plan.liveAgent !== true) {
      return false;
    }

    const count = await LiveAgentModel.countDocuments({ apiKeyId });
    return count < (plan.maxLiveAgents ?? 0);
  }

  /** Whether the user's plan includes Live Agent handoff. */
  async hasLiveAgent(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    return plan.liveAgent === true;
  }

  async assertLiveAgentEntitled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    const allowed = await this.hasLiveAgent(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Your plan does not include Live Agent");
    }
  }

  /** Whether the user's plan includes the Meeting Tool entitlement. */
  async hasMeetingTool(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    return plan.meetingTool === true;
  }

  async assertMeetingToolEntitled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    const allowed = await this.hasMeetingTool(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Your plan does not include the Meeting Tool");
    }
  }

  /** Whether the user's plan includes Customer Data & Lead Capture. */
  async hasLeadCapture(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    return plan.leadCapture === true;
  }

  async assertLeadCaptureEntitled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    const allowed = await this.hasLeadCapture(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Your plan does not include Lead Capture");
    }
  }

  /** Whether the user's plan includes WhatsApp. */
  async hasWhatsApp(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    return plan.whatsApp === true;
  }

  async assertWhatsAppEntitled(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<void> {
    const allowed = await this.hasWhatsApp(userId, apiKeyId);
    if (!allowed) {
      throw new Error("Your plan does not include WhatsApp");
    }
  }

  async canCreateMeetingTopic(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan || plan.meetingTool !== true) {
      return false;
    }

    const count = await MeetingTopicModel.countDocuments({ apiKeyId });
    return count < (plan.maxMeetingTopics ?? 0);
  }

  async canSetGuidanceCharacters(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    nextCharacterCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    if (nextCharacterCount < 0) {
      return false;
    }

    return nextCharacterCount <= (plan.maxCharactersPerGuidance ?? 2000);
  }

  async canCreateSnippet(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await TopicModel.countDocuments({
      apiKeyId,
      type: "snippet",
    });
    return count < (plan.maxSnippets ?? 50);
  }

  async canAddImagesToSnippet(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    nextImageCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    if (nextImageCount < 0) {
      return false;
    }

    return nextImageCount <= (plan.maxImagesPerSnippet ?? 10);
  }

  async canAddCharactersToSnippet(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    nextCharacterCount: number,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    if (nextCharacterCount < 0) {
      return false;
    }

    return nextCharacterCount <= (plan.maxCharactersPerSnippet ?? 5000);
  }

  async canCreateBatchTestGroup(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await BatchTestGroupModel.countDocuments({ apiKeyId });
    return count < (plan.batchTestGroupAmount ?? 5);
  }

  async canAddBatchTestQuestion(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    groupId: Types.ObjectId,
  ): Promise<boolean> {
    const { plan } = await this.ownerPlan(userId, apiKeyId);
    if (!plan) {
      return false;
    }

    const count = await BatchTestQuestionModel.countDocuments({
      groupId,
      apiKeyId,
    });
    return count < (plan.questionsPerBatchTestGroup ?? 50);
  }

  async getAnalyticsLookbackDays(
    userId: Types.ObjectId,
    apiKeyId?: Types.ObjectId,
  ): Promise<number> {
    const plan = apiKeyId
      ? (await this.ownerPlan(userId, apiKeyId)).plan
      : await userService.getUserPlan(userId);
    if (!plan) {
      throw new Error("Plan not found");
    }
    const days = plan.analyticsLookbackDays ?? 30;
    return Math.max(1, Math.floor(days));
  }

  /**
   * Clamp requested analytics date range to the plan lookback window
   * ending today. Rejects requests that start before the earliest allowed date.
   */
  async resolveAnalyticsDateRange(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    from?: Date,
    to?: Date,
  ): Promise<{ from: Date; to: Date; lookbackDays: number }> {
    await this.assertActiveApiKey(userId, apiKeyId);

    const lookbackDays = await this.getAnalyticsLookbackDays(userId, apiKeyId);
    const now = new Date();
    const earliest = new Date(now);
    earliest.setUTCHours(0, 0, 0, 0);
    earliest.setUTCDate(earliest.getUTCDate() - (lookbackDays - 1));

    const rangeTo = to && to.getTime() <= now.getTime() ? to : now;
    const rangeFrom = from ?? earliest;

    if (rangeFrom.getTime() < earliest.getTime()) {
      throw new Error(
        `Analytics lookback is limited to ${lookbackDays} days on your plan`,
      );
    }

    if (rangeFrom.getTime() > rangeTo.getTime()) {
      throw new Error("Analytics from date must be before to date");
    }

    return { from: rangeFrom, to: rangeTo, lookbackDays };
  }

  private async assertActiveApiKey(
    _userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<{ userId: Types.ObjectId }> {
    const apiKey = await ApiKeyModel.findById(apiKeyId).select("userId status");

    if (!apiKey) {
      throw new Error("API key not found");
    }

    try {
      assertApiKeyActive(apiKey.status.status);
    } catch (error) {
      if (error instanceof ApiKeyInactiveError) {
        throw new Error(error.message);
      }
      throw error;
    }

    return apiKey;
  }

  private async ownerPlan(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ) {
    const apiKey = await this.assertActiveApiKey(userId, apiKeyId);
    const plan = await userService.getUserPlan(apiKey.userId);
    return { apiKey, plan };
  }
}

export const entitlementService = new EntitlementService();

import { Types } from "mongoose";
import type {
  CreateNewsDto,
  NewsMediaOutDto,
  NewsOutDto,
  PublicNewsDetailOutDto,
  PublicNewsListItemOutDto,
  UpdateNewsDto,
} from "../../dto/news.dto";
import { ApiKeyModel } from "../../models/apiKey/apiKey.model";
import type { NewsInterface } from "../../models/news/news.interface";
import { NewsModel } from "../../models/news/news.model";
import type { WidgetInterface } from "../../models/widget/widget.interface";
import Widget from "../../models/widget/widget.model";
import {
  deleteWidgetFileIfExists,
  findOwnedWidgetFile,
  uploadWidgetFile,
} from "../../buckets/widgetBucket";
import {
  extractNewsMediaIds,
  newsExcerpt,
  sanitizeNewsHtml,
} from "../../utils/newsHtml";
import { entitlementService } from "../entitlement/entitlement.service";
import { widgetAnalyticsService } from "../widgetAnalytics/widgetAnalytics.service";
import { MAX_WIDGET_MEDIA_BYTES } from "./widget.service";

type NewsDoc = NewsInterface & { _id: Types.ObjectId };
type WidgetDoc = WidgetInterface & { _id: Types.ObjectId };

async function assertOwnedApiKey(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
): Promise<void> {
  const apiKey = await ApiKeyModel.findOne({ _id: apiKeyId }).lean();
  if (!apiKey) {
    throw new Error("API key not found");
  }
}

function toNewsOutDto(doc: NewsDoc): NewsOutDto {
  return {
    id: doc._id.toString(),
    apiKeyId: doc.apiKeyId.toString(),
    title: doc.title,
    heroImage: doc.heroImage ?? "",
    content: doc.content,
    cta: {
      enabled: doc.cta?.enabled ?? false,
      text: doc.cta?.text ?? "",
      url: doc.cta?.url ?? "",
    },
    enabled: doc.enabled,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function mediaIdsOf(heroImage: string, content: string): Set<string> {
  const ids = new Set(extractNewsMediaIds(content));
  if (heroImage) ids.add(heroImage);
  return ids;
}

async function assertOwnedMedia(
  userId: Types.ObjectId,
  apiKeyId: Types.ObjectId,
  mediaId: string,
): Promise<void> {
  if (!mediaId) return;
  const file = await findOwnedWidgetFile(mediaId, userId, apiKeyId);
  if (!file) {
    throw new Error("Media not found");
  }
}

async function deleteUnusedMedia(
  apiKeyId: Types.ObjectId,
  mediaIds: string[],
  exceptNewsId?: Types.ObjectId,
): Promise<void> {
  for (const mediaId of mediaIds) {
    if (!mediaId || !Types.ObjectId.isValid(mediaId)) continue;
    const stillUsed = await NewsModel.exists({
      apiKeyId,
      ...(exceptNewsId ? { _id: { $ne: exceptNewsId } } : {}),
      $or: [
        { heroImage: mediaId },
        { content: { $regex: `data-media-id="${mediaId}"` } },
      ],
    });
    if (stillUsed) continue;
    await deleteWidgetFileIfExists(mediaId);
  }
}

async function findPublicWidget(publicKey: string): Promise<WidgetDoc> {
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
  return doc;
}

export class NewsService {
  async list(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
  ): Promise<NewsOutDto[]> {
    await assertOwnedApiKey(userId, apiKeyId);
    const docs = await NewsModel.find({ apiKeyId })
      .sort({ createdAt: -1 })
      .lean<NewsDoc[]>();
    return docs.map(toNewsOutDto);
  }

  async create(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    input: CreateNewsDto,
  ): Promise<NewsOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);
    await assertOwnedMedia(userId, apiKeyId, input.heroImage ?? "");
    for (const mediaId of extractNewsMediaIds(input.content)) {
      await assertOwnedMedia(userId, apiKeyId, mediaId);
    }

    const doc = await NewsModel.create({
      userId,
      apiKeyId,
      title: input.title,
      heroImage: input.heroImage ?? "",
      content: input.content,
      cta: input.cta ?? { enabled: false, text: "", url: "" },
      enabled: input.enabled ?? true,
    });

    return toNewsOutDto(doc.toObject() as NewsDoc);
  }

  async get(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    newsId: string,
  ): Promise<NewsOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);
    const doc = await NewsModel.findOne({
      _id: newsId,
      apiKeyId,
    }).lean<NewsDoc>();
    if (!doc) {
      throw new Error("News not found");
    }
    return toNewsOutDto(doc);
  }

  async update(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    newsId: string,
    patch: UpdateNewsDto,
  ): Promise<NewsOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);
    const existing = await NewsModel.findOne({
      _id: newsId,
      apiKeyId,
    }).lean<NewsDoc>();
    if (!existing) {
      throw new Error("News not found");
    }

    if (patch.heroImage !== undefined) {
      await assertOwnedMedia(userId, apiKeyId, patch.heroImage);
    }
    if (patch.content !== undefined) {
      for (const mediaId of extractNewsMediaIds(patch.content)) {
        await assertOwnedMedia(userId, apiKeyId, mediaId);
      }
    }

    const nextHero = patch.heroImage ?? existing.heroImage ?? "";
    const nextContent = patch.content ?? existing.content;
    const previousIds = mediaIdsOf(existing.heroImage ?? "", existing.content);
    const nextIds = mediaIdsOf(nextHero, nextContent);

    const updated = await NewsModel.findOneAndUpdate(
      { _id: existing._id, apiKeyId },
      {
        $set: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.heroImage !== undefined ? { heroImage: patch.heroImage } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : {}),
          ...(patch.cta !== undefined ? { cta: patch.cta } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        },
      },
      { new: true },
    ).lean<NewsDoc>();

    if (!updated) {
      throw new Error("News not found");
    }

    const removed = [...previousIds].filter((id) => !nextIds.has(id));
    await deleteUnusedMedia(apiKeyId, removed, existing._id);
    return toNewsOutDto(updated);
  }

  async delete(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    newsId: string,
  ): Promise<void> {
    await assertOwnedApiKey(userId, apiKeyId);
    const existing = await NewsModel.findOne({
      _id: newsId,
      apiKeyId,
    }).lean<NewsDoc>();
    if (!existing) {
      throw new Error("News not found");
    }
    await NewsModel.deleteOne({ _id: existing._id });
    await deleteUnusedMedia(
      apiKeyId,
      [...mediaIdsOf(existing.heroImage ?? "", existing.content)],
    );
  }

  async deleteAllForApiKey(apiKeyId: Types.ObjectId): Promise<void> {
    await NewsModel.deleteMany({ apiKeyId });
  }

  async uploadMedia(
    userId: Types.ObjectId,
    apiKeyId: Types.ObjectId,
    file: Express.Multer.File | undefined,
  ): Promise<NewsMediaOutDto> {
    await assertOwnedApiKey(userId, apiKeyId);
    if (!file) {
      throw new Error("file is required");
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new Error("Only images allowed");
    }
    if (file.size > MAX_WIDGET_MEDIA_BYTES) {
      throw new Error("Image must be 5MB or smaller");
    }

    const uploaded = await uploadWidgetFile({
      buffer: file.buffer,
      filename: file.originalname || "news.bin",
      contentType: file.mimetype,
      metadata: { type: "news", userId, apiKeyId },
    });

    const mediaId = uploaded.id.toString();
    return {
      mediaId,
      url: `/widgets/media/${mediaId}?apiKeyId=${apiKeyId.toString()}`,
    };
  }

  async listPublic(
    publicKey: string,
    limit: number,
  ): Promise<PublicNewsListItemOutDto[]> {
    const widget = await findPublicWidget(publicKey);
    const docs = await NewsModel.find({
      apiKeyId: widget.apiKeyId,
      enabled: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<NewsDoc[]>();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      heroImage: doc.heroImage ?? "",
      excerpt: newsExcerpt(doc.content),
      createdAt: doc.createdAt.toISOString(),
    }));
  }

  async getPublic(
    publicKey: string,
    newsId: string,
    ip: string,
  ): Promise<PublicNewsDetailOutDto> {
    const widget = await findPublicWidget(publicKey);
    const doc = await NewsModel.findOne({
      _id: newsId,
      apiKeyId: widget.apiKeyId,
      enabled: true,
    }).lean<NewsDoc>();
    if (!doc) {
      throw new Error("News not found");
    }

    void widgetAnalyticsService.recordNewsView(
      widget.userId,
      widget.apiKeyId,
      doc._id.toString(),
      ip,
    );

    const ctaEnabled = Boolean(doc.cta?.enabled && doc.cta.text && doc.cta.url);
    return {
      id: doc._id.toString(),
      title: doc.title,
      heroImage: doc.heroImage ?? "",
      content: sanitizeNewsHtml(doc.content),
      cta: {
        enabled: ctaEnabled,
        text: ctaEnabled ? doc.cta.text : "",
        url: ctaEnabled ? doc.cta.url : "",
      },
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}

export const newsService = new NewsService();

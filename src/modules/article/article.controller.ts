import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  ArticleDetailOutDto,
  ArticleOutDto,
  ExportArticleOutDto,
  TopicOutDto,
} from "../../dto/article.dto";
import { parseApiKeyId, parseApiKeyIdQuery } from "../../validation/apiKey";
import {
  parseArticleRouteId,
  parseCreateArticleDto,
  parseForceQuery,
  parseUpdateArticleDto,
} from "../../validation/article";
import {
  parseCreateTopicDto,
  parseReorderTopicsDto,
  parseTopicRouteId,
  parseUpdateTopicDto,
} from "../../validation/topic";
import { getApiKeyScope } from "../../middleware/requireApiKeyAccess";
import { statusForMessage } from "../../validation/http";
import { articleService } from "./article.service";

function multerFiles(req: Request): Express.Multer.File[] {
  if (Array.isArray(req.files)) return req.files;
  return [];
}

export class ArticleController {
  list = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const data = await articleService.list(userId, apiKeyId);
      return res.status(200).json({
        success: true,
        message: "Articles retrieved",
        data,
      } satisfies ApiResponseDto<ArticleOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list articles";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  resyncAll = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const force = parseForceQuery(req.query.force);
      const data = await articleService.resync(null, userId, apiKeyId, force);
      return res.status(200).json({
        success: true,
        message: "Articles resynced",
        data,
      } satisfies ApiResponseDto<string[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resync articles";
      const status =
        error instanceof Error && "statusCode" in error
          ? Number((error as { statusCode: number }).statusCode)
          : statusForMessage(message, 500);
      return res.status(status).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  resyncOne = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseArticleRouteId(req.params.id);
      const force = parseForceQuery(req.query.force);
      const data = await articleService.resync(
        new Types.ObjectId(id),
        userId,
        apiKeyId,
        force,
      );
      return res.status(200).json({
        success: true,
        message: "Article resynced",
        data,
      } satisfies ApiResponseDto<string[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resync article";
      const status =
        error instanceof Error && "statusCode" in error
          ? Number((error as { statusCode: number }).statusCode)
          : statusForMessage(message, 500);
      return res.status(status).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const input = parseCreateArticleDto(req.body);
      const data = await articleService.create(userId, input, actorId);
      return res.status(201).json({
        success: true,
        message: "Article created",
        data,
      } satisfies ApiResponseDto<ArticleOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  importArticle = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = parseApiKeyId(
        req.body?.apiKeyId ?? req.query.apiKeyId,
      );
      const file = req.file;

      let data: ArticleDetailOutDto;
      if (file) {
        const name = (file.originalname || "").toLowerCase();
        const isZip =
          name.endsWith(".zip") ||
          file.mimetype === "application/zip" ||
          file.mimetype === "application/x-zip-compressed";
        if (isZip) {
          data = await articleService.importZip(
            userId,
            apiKeyId,
            file.buffer,
            actorId,
          );
        } else {
          const markdown = file.buffer.toString("utf8");
          data = await articleService.importMarkdown(
            userId,
            {
              apiKeyId: apiKeyId.toString(),
              markdown,
            },
            actorId,
          );
        }
      } else if (
        typeof req.body?.markdown === "string" &&
        req.body.markdown.trim()
      ) {
        data = await articleService.importMarkdown(
          userId,
          {
            apiKeyId: apiKeyId.toString(),
            markdown: req.body.markdown,
          },
          actorId,
        );
      } else {
        throw new Error("Provide a .md/.zip file or markdown string");
      }

      return res.status(201).json({
        success: true,
        message: "Article imported",
        data,
      } satisfies ApiResponseDto<ArticleDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getById = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseArticleRouteId(req.params.id);
      const data = await articleService.getById(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Article retrieved",
        data,
      } satisfies ApiResponseDto<ArticleDetailOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const id = parseArticleRouteId(req.params.id);
      const patch = parseUpdateArticleDto(req.body);
      const data = await articleService.update(
        userId,
        apiKeyId,
        id,
        patch,
        actorId,
      );
      return res.status(200).json({
        success: true,
        message: "Article updated",
        data,
      } satisfies ApiResponseDto<ArticleOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  remove = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseArticleRouteId(req.params.id);
      await articleService.delete(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Article deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  exportArticle = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const id = parseArticleRouteId(req.params.id);
      const data = await articleService.exportZip(userId, apiKeyId, id);
      return res.status(200).json({
        success: true,
        message: "Article exported",
        data,
      } satisfies ApiResponseDto<ExportArticleOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export article";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getMedia = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const mediaId = parseArticleRouteId(req.params.mediaId);
      const { contentType, stream } = await articleService.getOwnedMediaStream(
        userId,
        apiKeyId,
        mediaId,
      );

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      stream.on("error", next).pipe(res);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get media";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  ingestMedia = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const file = req.file;
      const url =
        typeof req.body?.url === "string" ? req.body.url.trim() : undefined;
      const articleIdRaw =
        typeof req.body?.articleId === "string"
          ? req.body.articleId.trim()
          : undefined;
      const articleId = articleIdRaw || undefined;

      const data = await articleService.ingestMedia(userId, apiKeyId, {
        file,
        url,
        articleId,
      });

      return res.status(201).json({
        success: true,
        message: "Media ingested",
        data,
      } satisfies ApiResponseDto<{ mediaId: string }>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to ingest media";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listTopics = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const articleId = parseArticleRouteId(req.params.articleId);
      const data = await articleService.listTopics(userId, apiKeyId, articleId);
      return res.status(200).json({
        success: true,
        message: "Topics retrieved",
        data,
      } satisfies ApiResponseDto<TopicOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list topics";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const articleId = parseArticleRouteId(req.params.articleId);
      const input = parseCreateTopicDto(req.body);
      const data = await articleService.createTopic(
        userId,
        apiKeyId,
        articleId,
        input,
        multerFiles(req),
        actorId,
      );
      return res.status(201).json({
        success: true,
        message: "Topic created",
        data,
      } satisfies ApiResponseDto<TopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const articleId = parseArticleRouteId(req.params.articleId);
      const topicId = parseTopicRouteId(req.params.topicId);
      const data = await articleService.getTopic(
        userId,
        apiKeyId,
        articleId,
        topicId,
      );
      return res.status(200).json({
        success: true,
        message: "Topic retrieved",
        data,
      } satisfies ApiResponseDto<TopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const articleId = parseArticleRouteId(req.params.articleId);
      const topicId = parseTopicRouteId(req.params.topicId);
      const patch = parseUpdateTopicDto(req.body);
      const data = await articleService.updateTopic(
        userId,
        apiKeyId,
        articleId,
        topicId,
        patch,
        multerFiles(req),
        actorId,
      );
      return res.status(200).json({
        success: true,
        message: "Topic updated",
        data,
      } satisfies ApiResponseDto<TopicOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deleteTopic = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId, actorId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(parseApiKeyIdQuery(req.query.apiKeyId));
      const articleId = parseArticleRouteId(req.params.articleId);
      const topicId = parseTopicRouteId(req.params.topicId);
      await articleService.deleteTopic(
        userId,
        apiKeyId,
        articleId,
        topicId,
        actorId,
      );
      return res.status(200).json({
        success: true,
        message: "Topic deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete topic";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  reorderTopics = async (req: Request, res: Response) => {
    try {
      const { ownerId: userId } = getApiKeyScope(req);

      const apiKeyId = new Types.ObjectId(
        parseApiKeyIdQuery(req.body?.apiKeyId ?? req.query.apiKeyId),
      );
      const articleId = parseArticleRouteId(req.params.articleId);
      const input = parseReorderTopicsDto(req.body);
      const data = await articleService.reorderTopics(
        userId,
        apiKeyId,
        articleId,
        input,
      );
      return res.status(200).json({
        success: true,
        message: "Topics reordered",
        data,
      } satisfies ApiResponseDto<TopicOutDto[]>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reorder topics";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

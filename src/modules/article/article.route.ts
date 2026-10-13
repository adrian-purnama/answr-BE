import { Router } from "express";
import multer from "multer";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { ArticleController } from "./article.controller";

const router = Router();
const articleController = new ArticleController();
const canTrainArticles = [
  requireUser,
  requireApiKeyPermission("train.articleSnippet"),
] as const;
const requireTrain = requireApiKeyPermission("train.articleSnippet");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 40 },
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

router.get("/", ...canTrainArticles, articleController.list);
router.post("/", ...canTrainArticles, articleController.create);
router.post(
  "/resync",
  ...canTrainArticles,
  rateLimit("articleSyncUser"),
  articleController.resyncAll,
);
router.post(
  "/import",
  requireUser,
  importUpload.single("file"),
  requireTrain,
  articleController.importArticle,
);

router.get("/media/:mediaId", ...canTrainArticles, articleController.getMedia);
router.post(
  "/media/ingest",
  requireUser,
  imageUpload.single("file"),
  requireTrain,
  articleController.ingestMedia,
);
router.post(
  "/:id/resync",
  ...canTrainArticles,
  rateLimit("articleResyncOneUser"),
  articleController.resyncOne,
);
router.get("/:id/export", ...canTrainArticles, articleController.exportArticle);
router.get("/:id", ...canTrainArticles, articleController.getById);
router.patch("/:id", ...canTrainArticles, articleController.update);
router.delete("/:id", ...canTrainArticles, articleController.remove);

router.get(
  "/:articleId/topics",
  ...canTrainArticles,
  articleController.listTopics,
);
router.post(
  "/:articleId/topics",
  requireUser,
  imageUpload.any(),
  requireTrain,
  articleController.createTopic,
);
router.patch(
  "/:articleId/topics/reorder",
  ...canTrainArticles,
  articleController.reorderTopics,
);
router.get(
  "/:articleId/topics/:topicId",
  ...canTrainArticles,
  articleController.getTopic,
);
router.patch(
  "/:articleId/topics/:topicId",
  requireUser,
  imageUpload.any(),
  requireTrain,
  articleController.updateTopic,
);
router.delete(
  "/:articleId/topics/:topicId",
  ...canTrainArticles,
  articleController.deleteTopic,
);

export default router;

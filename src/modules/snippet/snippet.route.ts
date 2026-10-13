import { Router } from "express";
import multer from "multer";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { SnippetController } from "./snippet.controller";

const router = Router();
const snippetController = new SnippetController();
const canTrainSnippets = [
  requireUser,
  requireApiKeyPermission("train.articleSnippet"),
] as const;
const requireTrain = requireApiKeyPermission("train.articleSnippet");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 40 },
});

router.get("/", ...canTrainSnippets, snippetController.list);
router.post("/", ...canTrainSnippets, snippetController.create);
router.post("/resync", ...canTrainSnippets, snippetController.resync);
router.get("/:id", ...canTrainSnippets, snippetController.getById);
router.patch(
  "/:id",
  requireUser,
  imageUpload.any(),
  requireTrain,
  snippetController.update,
);
router.delete("/:id", ...canTrainSnippets, snippetController.remove);

export default router;

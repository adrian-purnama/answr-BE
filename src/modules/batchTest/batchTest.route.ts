import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { BatchTestController } from "./batchTest.controller";

const router = Router();
const batchTestController = new BatchTestController();
const canTest = [requireUser, requireApiKeyPermission("test")] as const;

router.get("/", ...canTest, batchTestController.list);
router.post("/", ...canTest, batchTestController.create);
router.get("/:groupId", ...canTest, batchTestController.getById);
router.patch("/:groupId", ...canTest, batchTestController.update);
router.delete("/:groupId", ...canTest, batchTestController.remove);

router.post(
  "/:groupId/questions",
  ...canTest,
  batchTestController.addQuestion,
);
router.patch(
  "/:groupId/questions/:questionId",
  ...canTest,
  batchTestController.updateQuestion,
);
router.post(
  "/:groupId/questions/delete",
  ...canTest,
  batchTestController.deleteQuestions,
);
router.post(
  "/:groupId/questions/:questionId/rating",
  ...canTest,
  batchTestController.setRating,
);

router.post(
  "/:groupId/run",
  ...canTest,
  rateLimit("batchTestRunUser"),
  batchTestController.run,
);
router.get("/:groupId/progress", ...canTest, batchTestController.progress);

export default router;

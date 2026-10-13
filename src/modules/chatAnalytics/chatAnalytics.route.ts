import { Router } from "express";
import {
  requireAnyApiKeyPermission,
  requireApiKeyPermission,
} from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { ChatAnalyticsController } from "./chatAnalytics.controller";

const router = Router();
const chatAnalyticsController = new ChatAnalyticsController();
const canReadChatAnalytics = [
  requireUser,
  requireAnyApiKeyPermission(["performance", "gaps"]),
] as const;

router.get("/summary", ...canReadChatAnalytics, chatAnalyticsController.getSummary);
router.get("/trends", ...canReadChatAnalytics, chatAnalyticsController.getTrends);
router.get("/records", ...canReadChatAnalytics, chatAnalyticsController.listRecords);
router.get("/records/:id", ...canReadChatAnalytics, chatAnalyticsController.getRecord);
router.post(
  "/records/:id/resolve",
  requireUser,
  requireApiKeyPermission("gaps"),
  chatAnalyticsController.resolveGap,
);
router.get(
  "/conversations/:sessionId",
  ...canReadChatAnalytics,
  chatAnalyticsController.getConversation,
);
router.get("/categories", ...canReadChatAnalytics, chatAnalyticsController.listCategories);
router.post(
  "/categories",
  requireUser,
  requireApiKeyPermission("performance"),
  chatAnalyticsController.createCategory,
);
router.patch(
  "/categories/:id",
  requireUser,
  requireApiKeyPermission("performance"),
  chatAnalyticsController.updateCategory,
);
router.delete(
  "/categories/:id",
  requireUser,
  requireApiKeyPermission("performance"),
  chatAnalyticsController.deleteCategory,
);

export default router;

import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { widgetAnalyticsController } from "./widgetAnalytics.controller";

const router = Router();

router.get(
  "/summary",
  requireUser,
  requireApiKeyPermission("overview"),
  widgetAnalyticsController.getSummary,
);

export default router;

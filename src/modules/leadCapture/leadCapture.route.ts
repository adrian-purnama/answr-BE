import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { leadCaptureController } from "./leadCapture.controller";

const router = Router();
const canLeadCapture = [
  requireUser,
  requireApiKeyPermission("tools.leadCapture"),
] as const;

router.get("/settings", ...canLeadCapture, leadCaptureController.getSettings);
router.patch(
  "/settings",
  ...canLeadCapture,
  leadCaptureController.updateSettings,
);
router.get("/leads/export", ...canLeadCapture, leadCaptureController.exportLeads);
router.get(
  "/leads/:id/messages",
  ...canLeadCapture,
  leadCaptureController.listMessages,
);
router.delete("/leads/:id", ...canLeadCapture, leadCaptureController.deleteLead);
router.get("/leads", ...canLeadCapture, leadCaptureController.listLeads);

export default router;

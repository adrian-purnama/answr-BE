import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { whatsAppController } from "./whatsApp.controller";

const router = Router();
const canWhatsApp = [
  requireUser,
  requireApiKeyPermission("tools.whatsApp"),
] as const;

router.post(
  "/webhook/:userId/:apiKeyId",
  whatsAppController.webhook,
);
router.get("/settings", ...canWhatsApp, whatsAppController.getSettings);
router.patch("/settings", ...canWhatsApp, whatsAppController.updateSettings);
router.get("/flow", ...canWhatsApp, whatsAppController.getFlow);
router.put("/flow", ...canWhatsApp, whatsAppController.replaceFlow);
router.get("/qr", ...canWhatsApp, whatsAppController.getQr);
router.post("/logout", ...canWhatsApp, whatsAppController.logout);
router.post("/restart", ...canWhatsApp, whatsAppController.restart);

export default router;

import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { UiTemplateController } from "./uiTemplate.controller";

const router = Router();
const controller = new UiTemplateController();
const canMcp = [requireUser, requireApiKeyPermission("tools.mcp")] as const;

router.get("/", ...canMcp, controller.list);
router.post("/", ...canMcp, controller.create);
router.post(
  "/generate-from-tool",
  ...canMcp,
  rateLimit("llmChatUser"),
  controller.generateFromTool,
);
router.get("/:id", ...canMcp, controller.getById);
router.patch("/:id", ...canMcp, controller.update);
router.delete("/:id", ...canMcp, controller.remove);

export default router;

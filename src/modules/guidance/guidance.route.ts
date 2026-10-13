import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { GuidanceController } from "./guidance.controller";

const router = Router();
const guidanceController = new GuidanceController();
const canTrainGuidance = [
  requireUser,
  requireApiKeyPermission("train.guidance"),
] as const;

router.get("/", ...canTrainGuidance, guidanceController.list);
router.post("/", ...canTrainGuidance, guidanceController.create);
router.get("/:id", ...canTrainGuidance, guidanceController.getById);
router.patch("/:id", ...canTrainGuidance, guidanceController.update);
router.delete("/:id", ...canTrainGuidance, guidanceController.remove);

export default router;

import { Router } from "express";
import { requireUser } from "../../middleware/requireUser";
import { UserController } from "./user.controller";

const router = Router();
const userController = new UserController();

router.get("/plan", requireUser, userController.getMyPlan);
router.get("/plan-status", requireUser, userController.getMyPlanStatus);
router.get("/deepseek-usage", requireUser, userController.getDeepseekUsage);
router.get(
  "/dashboard-overview",
  requireUser,
  userController.getDashboardOverview,
);

export default router;

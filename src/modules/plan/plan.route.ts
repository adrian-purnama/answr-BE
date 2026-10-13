import { Router } from "express";
import { PlanController } from "./plan.controller";

const router = Router();
const planController = new PlanController();

router.get("/pricing", planController.getPricingPlans);

export default router;

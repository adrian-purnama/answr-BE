import { Router } from "express";
import { AppConfigController } from "./AppConfig.controller";

const router = Router();
const appConfigController = new AppConfigController();

router.get("/branding", appConfigController.getBranding);

export default router;

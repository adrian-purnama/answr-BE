import { Router } from "express";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { AuthController } from "./auth.controller";

const router = Router();
const authController = new AuthController();

router.post("/otp", rateLimit("otpSendIp"), authController.sendOtp);
router.post("/register", rateLimit("registerIp"), authController.register);
router.post("/login", rateLimit("loginIp"), authController.login);
router.post(
  "/reset-password",
  rateLimit("resetPasswordIp"),
  authController.resetPassword,
);
router.get("/validate", requireUser, authController.validateUser);
/** Any signed-in user may mint; service enforces project access when claims.apiKeyId is set. */
router.post("/visitor-jwt", requireUser, authController.createVisitorJwt);

export default router;

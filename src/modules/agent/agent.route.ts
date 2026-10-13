import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { AgentController } from "./agent.controller";

const router = Router();
const agentController = new AgentController();

router.post(
  "/test-chat",
  requireUser,
  requireApiKeyPermission("test"),
  rateLimit("llmChatUser"),
  agentController.testChat,
);
router.post(
  "/public/:publicKey/chat",
  rateLimit("llmChatIp"),
  agentController.widgetChat,
);

export default router;

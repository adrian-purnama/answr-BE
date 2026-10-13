import { Router } from "express";
import multer from "multer";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireLiveAgent } from "../../middleware/requireLiveAgent";
import { requireUser } from "../../middleware/requireUser";
import { LiveAgentController } from "./liveAgent.controller";
import { LiveAgentTicketController } from "./ticket.controller";
import { MAX_LIVE_AGENT_MEDIA_BYTES } from "./liveAgent.service";

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LIVE_AGENT_MEDIA_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
const liveAgentController = new LiveAgentController();
const ticketController = new LiveAgentTicketController();
const canLiveAgent = [
  requireUser,
  requireApiKeyPermission("tools.liveAgent"),
] as const;

router.post("/login", liveAgentController.login);
router.get("/me", requireLiveAgent, liveAgentController.me);
router.get("/settings", ...canLiveAgent, liveAgentController.getSettings);
router.patch("/settings", ...canLiveAgent, liveAgentController.updateSettings);

router.get("/tickets", requireLiveAgent, ticketController.listAgentTickets);
router.get("/tickets/:id", requireLiveAgent, ticketController.getAgentTicket);
router.get(
  "/tickets/:id/messages",
  requireLiveAgent,
  ticketController.listAgentMessages,
);
router.post("/tickets/:id/claim", requireLiveAgent, ticketController.claimTicket);
router.post(
  "/tickets/:id/messages",
  requireLiveAgent,
  ticketController.postAgentMessage,
);
router.post("/tickets/:id/close", requireLiveAgent, ticketController.closeTicket);

router.get("/", ...canLiveAgent, liveAgentController.list);
router.post("/", ...canLiveAgent, liveAgentController.create);
router.get(
  "/media/:mediaId",
  ...canLiveAgent,
  liveAgentController.getOwnedMedia,
);
router.post(
  "/:id/avatar",
  requireUser,
  imageUpload.single("file"),
  requireApiKeyPermission("tools.liveAgent"),
  liveAgentController.uploadAvatar,
);
router.post(
  "/:id/reset-password",
  ...canLiveAgent,
  liveAgentController.resetPassword,
);
router.get("/:id", ...canLiveAgent, liveAgentController.getById);
router.patch("/:id", ...canLiveAgent, liveAgentController.update);
router.delete("/:id", ...canLiveAgent, liveAgentController.remove);

export default router;

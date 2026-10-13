import { Router } from "express";
import multer from "multer";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { LiveAgentTicketController } from "../liveAgent/ticket.controller";
import { MeetingToolController } from "../meetingTool/meetingTool.controller";
import { newsController } from "./news.controller";
import { MAX_WIDGET_MEDIA_BYTES } from "./widget.service";
import { widgetAnalyticsController } from "../widgetAnalytics/widgetAnalytics.controller";
import { WidgetController } from "./widget.controller";

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_WIDGET_MEDIA_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
const widgetController = new WidgetController();
const ticketController = new LiveAgentTicketController();
const meetingToolController = new MeetingToolController();
const canWidget = [requireUser, requireApiKeyPermission("widget")] as const;

router.get(
  "/public/:publicKey/media/:mediaId",
  widgetController.getPublicMedia,
);
router.get(
  "/public/:publicKey/article-media/:mediaId",
  widgetController.getPublicArticleMedia,
);
router.get(
  "/public/:publicKey/live-agent-media/:mediaId",
  widgetController.getPublicLiveAgentMedia,
);
router.get(
  "/public/:publicKey/articles/:articleId",
  widgetController.getPublicArticle,
);
router.get(
  "/public/:publicKey/faq-content",
  widgetController.getFaqContent,
);
router.get("/public/:publicKey/news", newsController.listPublic);
router.get("/public/:publicKey/news/:id", newsController.getPublic);
router.post(
  "/public/:publicKey/visit",
  widgetAnalyticsController.recordPublicVisit,
);
router.post(
  "/public/:publicKey/chat-sessions",
  widgetController.createChatSession,
);
router.post(
  "/public/:publicKey/chat-sessions/:sessionId/rating",
  widgetAnalyticsController.submitPublicAiFeedback,
);
router.post(
  "/public/:publicKey/chat-sessions/:sessionId/identity",
  widgetController.bindVisitorIdentity,
);
router.get(
  "/public/:publicKey/chat-sessions/:sessionId/messages",
  widgetController.listPublicChatMessages,
);
router.get(
  "/public/:publicKey/chat-sessions/:sessionId",
  widgetController.getChatSession,
);
router.delete(
  "/public/:publicKey/chat-sessions/:sessionId",
  widgetController.deleteChatSession,
);

router.post(
  "/public/:publicKey/live-agent-tickets",
  ticketController.createVisitorTicket,
);
router.get(
  "/public/:publicKey/live-agent-tickets/active",
  ticketController.getActiveVisitorTicket,
);
router.get(
  "/public/:publicKey/live-agent-tickets/:ticketId",
  ticketController.getVisitorTicket,
);
router.get(
  "/public/:publicKey/live-agent-tickets/:ticketId/messages",
  ticketController.listVisitorMessages,
);
router.post(
  "/public/:publicKey/live-agent-tickets/:ticketId/messages",
  ticketController.postVisitorMessage,
);
router.post(
  "/public/:publicKey/live-agent-tickets/:ticketId/rating",
  ticketController.submitVisitorRating,
);

router.get(
  "/public/:publicKey/meetings/availability",
  meetingToolController.getPublicAvailability,
);
router.post(
  "/public/:publicKey/meetings",
  meetingToolController.bookPublic,
);

router.get("/public/:publicKey", widgetController.getByPublicKey);

router.post(
  "/media",
  requireUser,
  imageUpload.single("file"),
  requireApiKeyPermission("widget"),
  widgetController.uploadMedia,
);
router.get("/media/:mediaId", ...canWidget, widgetController.getOwnedMedia);

router.post(
  "/news/media",
  requireUser,
  imageUpload.single("file"),
  requireApiKeyPermission("widget"),
  newsController.uploadMedia,
);
router.get("/news", ...canWidget, newsController.list);
router.post("/news", ...canWidget, newsController.create);
router.get("/news/:id", ...canWidget, newsController.get);
router.patch("/news/:id", ...canWidget, newsController.update);
router.delete("/news/:id", ...canWidget, newsController.delete);

router.post(
  "/chat-sessions",
  ...canWidget,
  widgetController.createOwnedChatSession,
);
router.post(
  "/chat-sessions/:sessionId/identity",
  ...canWidget,
  widgetController.bindOwnedVisitorIdentity,
);
router.get(
  "/chat-sessions/:sessionId",
  ...canWidget,
  widgetController.getOwnedChatSession,
);
router.delete(
  "/chat-sessions/:sessionId",
  ...canWidget,
  widgetController.deleteOwnedChatSession,
);

router.get("/", ...canWidget, widgetController.getOrCreate);
router.patch("/", ...canWidget, widgetController.update);

export default router;

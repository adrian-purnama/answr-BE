import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { meetingToolController } from "./meetingTool.controller";

const router = Router();
const canMeeting = [
  requireUser,
  requireApiKeyPermission("tools.meeting"),
] as const;

router.get("/topics", ...canMeeting, meetingToolController.listTopics);
router.post("/topics", ...canMeeting, meetingToolController.createTopic);
router.get("/topics/:id", ...canMeeting, meetingToolController.getTopic);
router.patch("/topics/:id", ...canMeeting, meetingToolController.updateTopic);
router.delete("/topics/:id", ...canMeeting, meetingToolController.deleteTopic);

router.get("/meetings", ...canMeeting, meetingToolController.listMeetings);
router.patch(
  "/meetings/:id/cancel",
  ...canMeeting,
  meetingToolController.cancelMeeting,
);

export default router;

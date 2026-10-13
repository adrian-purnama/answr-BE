import { Router } from "express";
import { requireUser } from "../../middleware/requireUser";
import { ApiKeyCollaborationInviteController } from "./apiKeyCollaborationInvite.controller";

const router = Router();
const inviteController = new ApiKeyCollaborationInviteController();

router.post("/:token/accept", requireUser, inviteController.accept);

export default router;

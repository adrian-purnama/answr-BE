import { Router } from "express";
import { requireUser } from "../../middleware/requireUser";
import { requireApiKeyOwner } from "../../middleware/requireApiKeyAccess";
import { ApiKeyCollaborationInviteController } from "../apiKeyCollaborationInvite/apiKeyCollaborationInvite.controller";
import { ApiKeyCollaboratorController } from "../apiKeyCollaborator/apiKeyCollaborator.controller";
import { ApiKeyController } from "./apiKey.controller";

const router = Router();
const apiKeyController = new ApiKeyController();
const inviteController = new ApiKeyCollaborationInviteController();
const collaboratorController = new ApiKeyCollaboratorController();
const requireOwner = requireApiKeyOwner();

router.get("/", requireUser, apiKeyController.list);
router.post("/", requireUser, apiKeyController.create);
router.get("/:id/collaborators", requireUser, requireOwner, collaboratorController.list);
router.patch(
  "/:id/collaborators/:userId",
  requireUser,
  requireOwner,
  collaboratorController.update,
);
router.delete(
  "/:id/collaborators/:userId",
  requireUser,
  requireOwner,
  collaboratorController.remove,
);
router.get("/:id", requireUser, apiKeyController.getById);
router.patch("/:id", requireUser, requireOwner, apiKeyController.update);
router.post("/:id/rotate", requireUser, requireOwner, apiKeyController.rotate);
router.post(
  "/:id/collaboration-invites",
  requireUser,
  requireOwner,
  inviteController.create,
);
router.delete("/:id", requireUser, requireOwner, apiKeyController.revoke);

export default router;

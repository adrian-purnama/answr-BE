import { Router } from "express";
import { requireApiKeyPermission } from "../../middleware/requireApiKeyAccess";
import { requireUser } from "../../middleware/requireUser";
import { McpController } from "./mcp.controller";

const router = Router();
const mcpController = new McpController();
const canMcp = [requireUser, requireApiKeyPermission("tools.mcp")] as const;

router.get("/", ...canMcp, mcpController.list);
router.post("/", ...canMcp, mcpController.create);
router.get("/tools/enabled", ...canMcp, mcpController.listEnabledTools);
router.post("/:id/sync", ...canMcp, mcpController.sync);
router.get("/:id/tools", ...canMcp, mcpController.listTools);
router.patch("/:id/tools/:toolId", ...canMcp, mcpController.updateTool);
router.get("/:id", ...canMcp, mcpController.getById);
router.patch("/:id", ...canMcp, mcpController.update);
router.delete("/:id", ...canMcp, mcpController.remove);

export default router;

import { Router } from "express";
import multer from "multer";
import { requireAdmin } from "../../middleware/requireAdmin";
import { requireUser } from "../../middleware/requireUser";
import { AdminController } from "./admin.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
const adminController = new AdminController();

router.get(
  "/app-config",
  requireUser,
  requireAdmin,
  adminController.getAppConfig,
);

router.patch(
  "/app-config",
  requireUser,
  requireAdmin,
  adminController.updateAppConfig,
);

router.post(
  "/app-logo",
  requireUser,
  requireAdmin,
  upload.single("file"),
  adminController.updateAppLogo,
);

router.get("/plans", requireUser, requireAdmin, adminController.getAllPlans);
router.post("/plans", requireUser, requireAdmin, adminController.createPlan);
router.patch(
  "/plans/:id",
  requireUser,
  requireAdmin,
  adminController.updatePlan,
);
router.delete(
  "/plans/:id",
  requireUser,
  requireAdmin,
  adminController.deletePlan,
);

router.get("/users", requireUser, requireAdmin, adminController.searchUsers);
router.get("/users/:id", requireUser, requireAdmin, adminController.getUser);
router.patch(
  "/users/:id",
  requireUser,
  requireAdmin,
  adminController.updateUser,
);

router.get(
  "/plan-period-sync",
  requireUser,
  requireAdmin,
  adminController.getPlanPeriodSyncStatus,
);
router.post(
  "/plan-period-sync/run",
  requireUser,
  requireAdmin,
  adminController.runPlanPeriodSync,
);

router.get(
  "/users/:id/plan-periods",
  requireUser,
  requireAdmin,
  adminController.listPlanPeriods,
);
router.get(
  "/users/:id/current-period-quota",
  requireUser,
  requireAdmin,
  adminController.getCurrentPeriodQuota,
);
router.post(
  "/users/:id/plan-periods/preview",
  requireUser,
  requireAdmin,
  adminController.previewPlanPeriods,
);
router.post(
  "/users/:id/plan-periods",
  requireUser,
  requireAdmin,
  adminController.addPlanPeriods,
);
router.delete(
  "/users/:id/plan-periods/:periodId",
  requireUser,
  requireAdmin,
  adminController.removePlanPeriod,
);
router.post(
  "/users/:id/periods/:periodId/token-adjustments",
  requireUser,
  requireAdmin,
  adminController.adjustPeriodTokens,
);
router.get(
  "/users/:id/invoices",
  requireUser,
  requireAdmin,
  adminController.listUserInvoices,
);
router.post(
  "/users/:id/invoices",
  requireUser,
  requireAdmin,
  adminController.createUserInvoice,
);
router.post(
  "/invoices/:invoiceId/mark-paid",
  requireUser,
  requireAdmin,
  adminController.markInvoicePaid,
);

export default router;

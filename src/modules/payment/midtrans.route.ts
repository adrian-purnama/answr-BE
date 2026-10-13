import { Router } from "express";
import { requireUser } from "../../middleware/requireUser";
import { rateLimit } from "../../rateLimit/rateLimit.middleware";
import { MidtransController } from "./midtrans.controller";

const router = Router();
const controller = new MidtransController();

router.post(
  "/invoices",
  requireUser,
  rateLimit("invoicePurchaseUser"),
  rateLimit("invoicePurchaseIp"),
  controller.createInvoice,
);
router.get("/invoices", requireUser, controller.listInvoices);
router.get("/invoices/active", requireUser, controller.getActiveInvoice);
router.get("/invoices/:id/export-pdf", requireUser, controller.exportInvoicePdf);
router.get("/invoices/:id", requireUser, controller.getInvoice);
router.get("/midtrans/client-config", requireUser, controller.getClientConfig);
/** Public   Midtrans servers are not authenticated users. Security = signature. */
router.post("/midtrans/notification", controller.notification);

export default router;

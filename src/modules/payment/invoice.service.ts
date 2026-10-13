import { Types } from "mongoose";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type {
  CreateAdminInvoiceDto,
  InvoiceListOutDto,
  InvoiceOutDto,
  InvoiceStartModeDto,
  InvoiceTypeDto,
} from "../../dto/invoice.dto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import type { InvoiceInterface } from "../../models/invoice/invoice.interface";
import { InvoiceModel } from "../../models/invoice/invoice.model";
import { PlanModel } from "../../models/plan/plan.model";
import { isNeverUntil } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { UserPlanPeriodModel } from "../../models/userPlanPeriod/userPlanPeriod.model";
import { UserModel } from "../../models/user/user.model";
import { addCalendarMonths } from "../../utils/calendarMonth";
import { mailer } from "../mail/mail.service";
import { isDuplicateKeyError } from "../userPlanPeriod/planPeriodConflict.error";
import { userPlanPeriodService } from "../userPlanPeriod/userPlanPeriod.service";
import { paymentPollConfig } from "./payment.config";
import fs from "fs";
import path from "path";
import {
  midtransService,
  type MidtransNotificationPayload,
  type MidtransStatusResult,
} from "./midtrans.service";

export class PendingInvoiceConflictError extends Error {
  readonly pendingInvoiceId: string;

  constructor(pendingInvoiceId: string) {
    super(
      `User already has a pending invoice (${pendingInvoiceId}). Pass expirePendingAndContinue to replace it.`,
    );
    this.name = "PendingInvoiceConflictError";
    this.pendingInvoiceId = pendingInvoiceId;
  }
}

/** Public for tests: QR / deep-link target for an unpaid invoice. */
export function buildInvoicePaymentPageUrl(invoiceId: string): string {
  return `${env.frontendUrl.replace(/\/$/, "")}/payment/${invoiceId}`;
}

export type MidtransStatusSource = "webhook" | "poll";

type InvoiceLean = InvoiceInterface & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

type InvoiceDoc = InstanceType<typeof InvoiceModel>;

function purgeAtFromNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + env.invoicePurgeDays * 24 * 60 * 60 * 1000);
}

function isPurchasablePrice(price: unknown): price is number {
  return (
    typeof price === "number" &&
    Number.isInteger(price) &&
    Number.isFinite(price) &&
    price > 0
  );
}

function isValidAmount(price: unknown): price is number {
  return (
    typeof price === "number" &&
    Number.isInteger(price) &&
    Number.isFinite(price) &&
    price >= 0
  );
}

function remainingExpiryMinutes(expiresAt: Date, now: Date = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  const minutes = Math.ceil(ms / 60_000);
  return Math.max(5, minutes);
}

async function planNameById(
  planId: Types.ObjectId | null | undefined,
): Promise<string | null> {
  if (!planId) return null;
  const plan = await PlanModel.findById(planId).select("name").lean();
  return plan?.name ?? "Plan";
}

/** Line-item / Snap display label (not a plan name for token_topup). */
function invoiceItemLabel(
  type: InvoiceTypeDto,
  planName: string | null,
  deepseekTokens: number | null,
): string {
  if (type === "token_topup") {
    if (typeof deepseekTokens === "number") {
      return `Token top-up (+${deepseekTokens.toLocaleString("en-US")} tokens)`;
    }
    return "Token top-up";
  }
  return planName ?? "Plan";
}

function toOutDtoBase(
  doc: InvoiceLean,
  planName: string | null,
): Omit<InvoiceOutDto, "simulatedPeriod"> {
  const type = (doc.type ?? "plan_purchase") as InvoiceTypeDto;
  const startMode = (doc.startMode ?? null) as InvoiceStartModeDto | null;
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    planId: type === "token_topup" ? null : (doc.planId?.toString() ?? null),
    planName: type === "token_topup" ? null : planName,
    type,
    listPrice: doc.listPrice ?? doc.amount,
    amount: doc.amount,
    status: doc.status,
    startMode: type === "plan_purchase" ? startMode ?? "after_current" : null,
    targetPeriodId: doc.targetPeriodId?.toString() ?? null,
    deepseekTokens:
      typeof doc.deepseekTokens === "number" ? doc.deepseekTokens : null,
    createdByAdminId: doc.createdByAdminId?.toString() ?? null,
    manualPaidNote: doc.manualPaidNote ?? null,
    snapToken: doc.snapToken ?? null,
    expiresAt: doc.expiresAt.toISOString(),
    paidAt: doc.paidAt ? doc.paidAt.toISOString() : null,
    activatedAt: doc.activatedAt ? doc.activatedAt.toISOString() : null,
    effectAppliedAt: doc.effectAppliedAt
      ? doc.effectAppliedAt.toISOString()
      : null,
    midtransTransactionStatus: doc.midtransTransactionStatus ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

export class InvoiceService {
  private async toOutDto(
    doc: InvoiceLean,
    planName: string | null,
  ): Promise<InvoiceOutDto> {
    const base = toOutDtoBase(doc, planName);
    if (doc.status !== "pending" || (doc.type ?? "plan_purchase") !== "plan_purchase") {
      return { ...base, simulatedPeriod: null };
    }
    if (!doc.planId) {
      return { ...base, simulatedPeriod: null };
    }
    const startMode = doc.startMode ?? "after_current";
    const period =
      startMode === "immediate"
        ? await this.computeImmediatePeriod()
        : await this.computePaidPeriod(doc.userId);
    return {
      ...base,
      simulatedPeriod: {
        planId: doc.planId.toString(),
        planName: planName ?? "Plan",
        effectiveDate: period.effectiveDate.toISOString(),
        untilDate: period.untilDate.toISOString(),
      },
    };
  }

  async expireStalePendingForUser(userId: Types.ObjectId): Promise<void> {
    const now = new Date();
    // Keep pending through the poll grace window so late Midtrans settlements can still activate.
    const graceCutoff = new Date(
      now.getTime() - paymentPollConfig.expiryGraceMs,
    );
    await InvoiceModel.updateMany(
      {
        userId,
        status: "pending",
        expiresAt: { $lte: graceCutoff },
      },
      {
        $set: {
          status: "expired",
          purgeAt: purgeAtFromNow(now),
        },
      },
    );
  }

  async markExpiredIfStillPending(invoiceId: Types.ObjectId): Promise<void> {
    await InvoiceModel.updateOne(
      { _id: invoiceId, status: "pending" },
      {
        $set: {
          status: "expired",
          purgeAt: purgeAtFromNow(),
        },
      },
    );
  }

  async getActiveInvoice(userId: Types.ObjectId): Promise<InvoiceOutDto | null> {
    await this.expireStalePendingForUser(userId);
    const now = new Date();
    const doc = await InvoiceModel.findOne({
      userId,
      status: "pending",
      expiresAt: { $gt: now },
    }).lean<InvoiceLean | null>();

    if (!doc) return null;
    const planName = await planNameById(doc.planId);
    return this.toOutDto(doc, planName);
  }

  /**
   * Load one invoice for the authenticated user.
   * Missing or wrong owner → "Invoice not found" (404; no ownership leak).
   */
  async getForUser(
    userId: Types.ObjectId,
    invoiceId: string,
  ): Promise<InvoiceOutDto> {
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new Error("Invoice not found");
    }
    const doc = await InvoiceModel.findById(invoiceId).lean<InvoiceLean | null>();
    if (!doc || !doc.userId.equals(userId)) {
      throw new Error("Invoice not found");
    }
    const planName = await planNameById(doc.planId);
    return this.toOutDto(doc, planName);
  }

  /**
   * PDF invoice for the owner. PAID: status only. Not paid: UNPAID + payment-page QR.
   */
  async exportPdfForUser(
    userId: Types.ObjectId,
    invoiceId: string,
  ): Promise<{ buffer: Buffer; filename: string; paymentPageUrl: string | null }> {
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new Error("Invoice not found");
    }
    const doc = await InvoiceModel.findById(invoiceId).lean<InvoiceLean | null>();
    if (!doc || !doc.userId.equals(userId)) {
      throw new Error("Invoice not found");
    }
    const type = (doc.type ?? "plan_purchase") as InvoiceTypeDto;
    const planName = await planNameById(doc.planId);
    const itemLabel = invoiceItemLabel(
      type,
      planName,
      typeof doc.deepseekTokens === "number" ? doc.deepseekTokens : null,
    );
    const isPaid = doc.status === "paid";
    const paymentPageUrl = isPaid
      ? null
      : buildInvoicePaymentPageUrl(doc._id.toString());
    const user = await UserModel.findById(doc.userId).select("email").lean();

    const buffer = await this.buildInvoicePdfBuffer({
      id: doc._id.toString(),
      planName: itemLabel,
      amount: doc.amount,
      status: doc.status,
      expiresAt: doc.expiresAt,
      paidAt: doc.paidAt ?? null,
      createdAt: doc.createdAt ?? new Date(),
      isPaid,
      paymentPageUrl,
      customerEmail: user?.email?.trim() || " ",
      invoiceType: type,
    });

    return {
      buffer,
      filename: `invoice-${doc._id.toString()}.pdf`,
      paymentPageUrl,
    };
  }

  private async buildInvoicePdfBuffer(input: {
    id: string;
    planName: string;
    amount: number;
    status: string;
    expiresAt: Date;
    paidAt: Date | null;
    createdAt: Date;
    isPaid: boolean;
    paymentPageUrl: string | null;
    customerEmail: string;
    invoiceType?: InvoiceTypeDto;
  }): Promise<Buffer> {
    const C = {
      primary: "#243B5A",
      accent: "#315C91",
      text: "#253247",
      muted: "#718096",
      border: "#E2E8F0",
      light: "#F7F9FC",
      green: "#16845B",
      greenBg: "#EAF7F0",
      red: "#C92A35",
      redBg: "#FFF0F0",
    };

    const LEFT = 48;
    const RIGHT = 547;
    const WIDTH = RIGHT - LEFT;
    const siteUrl = env.frontendUrl.replace(/\/$/, "");
    const supportEmail = 'support@answr.id'

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      })
        .format(value)
        .replace(/\u00a0/g, " ");

    const formatDate = (date: Date) =>
      new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(date);

    const formatDateTime = (date: Date) =>
      new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
        hour12: false,
      }).format(date);

    const hr = (doc: PDFKit.PDFDocument, y: number) => {
      doc
        .save()
        .strokeColor(C.border)
        .lineWidth(0.7)
        .moveTo(LEFT, y)
        .lineTo(RIGHT, y)
        .stroke()
        .restore();
    };

    const metaCell = (
      doc: PDFKit.PDFDocument,
      label: string,
      value: string,
      x: number,
      y: number,
      width: number,
    ) => {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(C.muted)
        .text(label.toUpperCase(), x, y, { width });
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(C.text)
        .text(value, x, y + 11, { width });
    };

    const qrPng =
      !input.isPaid && input.paymentPageUrl
        ? await QRCode.toBuffer(input.paymentPageUrl, {
            type: "png",
            width: 220,
            margin: 1,
            errorCorrectionLevel: "M",
          })
        : null;

    const logoPath = path.join(process.cwd(), "src", "asset", "logo.png");
    const paid = input.isPaid ? input.amount : 0;
    const balance = Math.max(0, input.amount - paid);
    const dueLabel = input.isPaid ? "Paid" : "Due";
    const dueValue = input.isPaid
      ? input.paidAt
        ? formatDateTime(input.paidAt)
        : formatDate(input.createdAt)
      : formatDateTime(input.expiresAt);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        bufferPages: true,
        info: {
          Title: `Invoice ${input.id}`,
          Author: "answr.id",
          Subject: `Subscription invoice for ${input.planName}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      //    Header   
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, LEFT, 36, { width: 78, height: 34, fit: [78, 34] });
      } else {
        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .fillColor(C.primary)
          .text("answr.id", LEFT, 42);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(C.primary)
        .text("INVOICE", 300, 40, { width: 145, align: "right" });

      const statusColor = input.isPaid ? C.green : C.red;
      const statusBg = input.isPaid ? C.greenBg : C.redBg;
      const statusText = input.isPaid ? "PAID" : "UNPAID";

      doc.save().roundedRect(455, 38, 92, 24, 4).fill(statusBg).restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(statusColor)
        .text(statusText, 455, 45, { width: 92, align: "center" });

      hr(doc, 78);

      //    Parties   
      const partyTop = 90;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(C.muted)
        .text("FROM", LEFT, partyTop)
        .text("BILL TO", 300, partyTop);

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(C.text)
        .text("answr.id", LEFT, partyTop + 12)
        .text(input.customerEmail, 300, partyTop + 12, { width: 245 });

      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(C.muted)
        .text(siteUrl, LEFT, partyTop + 26, {
          link: siteUrl,
          underline: false,
          width: 230,
        })
        .text(supportEmail, LEFT, partyTop + 38, {
          link: `mailto:${supportEmail}`,
          width: 230,
        })
        .text("Account holder", 300, partyTop + 26, { width: 245 });

      //    Meta strip   
      const metaTop = partyTop + 62;
      doc.save().roundedRect(LEFT, metaTop, WIDTH, 38, 4).fill(C.light).restore();

      metaCell(doc, "Invoice no.", input.id, LEFT + 10, metaTop + 8, 155);
      metaCell(doc, "Issued", formatDate(input.createdAt), 220, metaTop + 8, 90);
      metaCell(doc, dueLabel, dueValue, 320, metaTop + 8, 130);
      metaCell(doc, "Currency", "IDR", 460, metaTop + 8, 70);

      //    Line items   
      const tableTop = metaTop + 52;
      doc.save().rect(LEFT, tableTop, WIDTH, 22).fill(C.light).restore();

      const descX = LEFT + 10;
      const qtyX = 360;
      const unitX = 410;
      const amountX = 475;

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(C.muted)
        .text("DESCRIPTION", descX, tableTop + 7, { width: 240 })
        .text("QTY", qtyX, tableTop + 7, { width: 36, align: "right" })
        .text("UNIT PRICE", unitX, tableTop + 7, { width: 58, align: "right" })
        .text("AMOUNT", amountX, tableTop + 7, { width: 62, align: "right" });

      const rowY = tableTop + 30;
      const isTopup = input.invoiceType === "token_topup";
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(C.text)
        .text(
          isTopup ? input.planName : `${input.planName} - subscription`,
          descX,
          rowY,
          { width: 300 },
        );
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(C.muted)
        .text(
          isTopup
            ? "answr.id · DeepSeek token top-up"
            : "answr.id · 1 billing period",
          descX,
          rowY + 14,
          {
            width: 300,
          },
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(C.text)
        .text("1", qtyX, rowY + 4, { width: 36, align: "right" })
        .text(formatCurrency(input.amount), unitX, rowY + 4, {
          width: 58,
          align: "right",
        })
        .text(formatCurrency(input.amount), amountX, rowY + 4, {
          width: 62,
          align: "right",
        });

      hr(doc, rowY + 36);

      //    Totals   
      const summaryTop = rowY + 48;
      const labelX = 350;
      const valueX = 450;

      const summaryRow = (
        label: string,
        value: string,
        y: number,
        opts?: { muted?: boolean; bold?: boolean },
      ) => {
        doc
          .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts?.bold ? 9.5 : 8.5)
          .fillColor(opts?.muted ? C.muted : C.text)
          .text(label, labelX, y, { width: 90, align: "right" })
          .fillColor(C.text)
          .text(value, valueX, y, { width: 85, align: "right" });
      };

      summaryRow("Subtotal", formatCurrency(input.amount), summaryTop, {
        muted: true,
      });
      summaryRow("Tax", " ", summaryTop + 16, { muted: true });
      summaryRow("Paid", formatCurrency(paid), summaryTop + 32, {
        muted: true,
      });

      const dueTop = summaryTop + 52;
      doc.save().roundedRect(340, dueTop - 6, 207, 30, 4).fill(C.light).restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(C.primary)
        .text("BALANCE DUE", labelX, dueTop + 3, {
          width: 90,
          align: "right",
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(input.isPaid ? C.green : C.primary)
        .text(formatCurrency(balance), valueX, dueTop + 1, {
          width: 85,
          align: "right",
        });

      //    Notes / payment   
      let cursorY = dueTop + 42;

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(C.primary)
        .text("NOTES", LEFT, cursorY);

      const notes = [
        `Status: ${input.status.toUpperCase()} · Payment: online via Midtrans`,
        input.isPaid
          ? `Settled${input.paidAt ? ` on ${formatDateTime(input.paidAt)}` : ""}. Plan access activates per your account period.`
          : `Pay before ${formatDateTime(input.expiresAt)} (WIB). Unpaid invoices expire automatically.`,
        "Amount is in Indonesian Rupiah (IDR). This is a digital subscription invoice.",
      ];

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(C.muted)
        .text(notes.join("\n"), LEFT, cursorY + 12, {
          width: WIDTH,
          lineGap: 2,
        });

      cursorY = cursorY + 12 + 42;

      if (qrPng && input.paymentPageUrl) {
        cursorY += 8;
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(C.primary)
          .text("PAY THIS INVOICE", LEFT, cursorY);

        const boxTop = cursorY + 12;
        const boxH = 108;
        doc.save().roundedRect(LEFT, boxTop, WIDTH, boxH, 5).fill(C.light).restore();

        doc.image(qrPng, LEFT + 12, boxTop + 12, { width: 84, height: 84 });

        doc
          .save()
          .strokeColor(C.border)
          .lineWidth(0.7)
          .moveTo(LEFT + 112, boxTop + 14)
          .lineTo(LEFT + 112, boxTop + boxH - 14)
          .stroke()
          .restore();

        const textX = LEFT + 128;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(C.text)
          .text("Scan QR or open the payment page", textX, boxTop + 18);

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(C.muted)
          .text(
            "Use your browser or banking app to complete payment securely.",
            textX,
            boxTop + 34,
            { width: 340 },
          );

        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor(C.accent)
          .text("Open payment page", textX, boxTop + 58, {
            link: input.paymentPageUrl,
            underline: true,
          });

        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(C.muted)
          .text(`Expires ${formatDateTime(input.expiresAt)} WIB`, textX, boxTop + 76, {
            width: 340,
          });

        cursorY = boxTop + boxH + 16;
      }

      //    Footer   
      const footerY = Math.max(cursorY + 24, 760);
      hr(doc, footerY);
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(C.muted)
        .text(
          `Thank you for choosing answr.id  ·  ${supportEmail}`,
          LEFT,
          footerY + 10,
          { width: WIDTH, align: "center" },
        );

      doc.end();
    });
  }



  /** Pending + paid invoices for the user, newest first. */
  async listForUser(
    userId: Types.ObjectId,
    input: { page: number; pageSize: number },
  ): Promise<InvoiceListOutDto> {
    await this.expireStalePendingForUser(userId);

    const page = Math.max(1, Math.trunc(input.page));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize)));
    const skip = (page - 1) * pageSize;
    const filter = {
      userId,
      status: { $in: ["pending", "paid"] as const },
    };

    const [total, docs] = await Promise.all([
      InvoiceModel.countDocuments(filter),
      InvoiceModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean<InvoiceLean[]>(),
    ]);

    const planIds = [
      ...new Set(
        docs
          .map((doc) => doc.planId?.toString())
          .filter((id): id is string => Boolean(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
    const plans =
      planIds.length > 0
        ? await PlanModel.find({ _id: { $in: planIds } })
            .select("name")
            .lean<Array<{ _id: Types.ObjectId; name: string }>>()
        : [];
    const nameById = new Map(
      plans.map((plan) => [plan._id.toString(), plan.name]),
    );

    const items = await Promise.all(
      docs.map((doc) => {
        const type = (doc.type ?? "plan_purchase") as InvoiceTypeDto;
        const planName =
          type === "token_topup"
            ? null
            : (nameById.get(doc.planId?.toString() ?? "") ?? "Plan");
        return this.toOutDto(doc, planName);
      }),
    );

    return { items, page, pageSize, total };
  }

  /** Also returns paid invoice briefly so the payment page can poll to completion. */
  async getInvoiceStatusForUser(
    userId: Types.ObjectId,
  ): Promise<InvoiceOutDto | null> {
    await this.expireStalePendingForUser(userId);
    const now = new Date();

    const pending = await InvoiceModel.findOne({
      userId,
      status: "pending",
      expiresAt: { $gt: now },
    });

    if (pending) {
      const throttleMs = paymentPollConfig.onDemandThrottleMs;
      const last = pending.lastPolledAt?.getTime() ?? 0;
      if (!pending.lastPolledAt || now.getTime() - last >= throttleMs) {
        try {
          await this.pollInvoiceFromMidtrans(pending._id, throttleMs);
        } catch (err) {
          logger.warn(
            `On-demand Midtrans poll failed for ${pending._id.toString()}: ${err instanceof Error ? err.message : "unknown"}`,
            "invoice.service",
            "getInvoiceStatusForUser",
          );
        }
      }

      const fresh = await InvoiceModel.findById(pending._id).lean<InvoiceLean | null>();
      if (fresh) {
        return this.toOutDto(fresh, await planNameById(fresh.planId));
      }
    }

    const recentPaid = await InvoiceModel.findOne({
      userId,
      status: "paid",
      paidAt: { $gte: new Date(now.getTime() - 10 * 60_000) },
    })
      .sort({ paidAt: -1 })
      .lean<InvoiceLean | null>();

    if (recentPaid) {
      return this.toOutDto(recentPaid, await planNameById(recentPaid.planId));
    }

    return null;
  }

  /**
   * Atomically claim an invoice for a Midtrans status poll.
   * Returns null if another worker claimed it within the throttle window.
   */
  async claimForPoll(
    invoiceId: Types.ObjectId,
    throttleMs: number,
    now: Date = new Date(),
  ): Promise<InvoiceDoc | null> {
    const threshold = new Date(now.getTime() - throttleMs);
    return InvoiceModel.findOneAndUpdate(
      {
        _id: invoiceId,
        status: "pending",
        $or: [
          { lastPolledAt: null },
          { lastPolledAt: { $exists: false } },
          { lastPolledAt: { $lte: threshold } },
        ],
      },
      {
        $set: { lastPolledAt: now },
        $inc: { pollCount: 1 },
      },
      { returnDocument: "after" },
    );
  }

  /**
   * Claim + Get Status + applyMidtransStatus. Safe for background and on-demand.
   */
  async pollInvoiceFromMidtrans(
    invoiceId: Types.ObjectId,
    throttleMs: number = paymentPollConfig.intervalMs,
  ): Promise<void> {
    const claimed = await this.claimForPoll(invoiceId, throttleMs);
    if (!claimed) {
      logger.debug(
        `Skip poll claim for ${invoiceId.toString()}`,
        "invoice.service",
        "pollInvoiceFromMidtrans",
      );
      return;
    }

    logger.debug(
      `Polling Midtrans status for order ${invoiceId.toString()}`,
      "invoice.service",
      "pollInvoiceFromMidtrans",
    );

    const outcome = await midtransService.getTransactionStatus(
      invoiceId.toString(),
    );
    const pastExpiry = claimed.expiresAt.getTime() <= Date.now();

    if (outcome.kind === "not_found") {
      if (pastExpiry) {
        await this.markExpiredIfStillPending(invoiceId);
      }
      return;
    }
    if (outcome.kind === "unauthorized" || outcome.kind === "retryable") {
      return;
    }

    const result = await this.applyMidtransStatus(
      claimed,
      midtransService.statusResultToPayload(outcome.data),
      "poll",
    );

    if (pastExpiry && result.message === "Pending") {
      await this.markExpiredIfStillPending(invoiceId);
      logger.warn(
        `Final poll still pending past expiresAt   marked expired orderId=${invoiceId.toString()}`,
        "invoice.service",
        "pollInvoiceFromMidtrans",
      );
    }
  }

  async createOrReuse(
    userId: Types.ObjectId,
    planIdRaw: string,
  ): Promise<InvoiceOutDto> {
    if (!Types.ObjectId.isValid(planIdRaw)) {
      throw new Error("Invalid plan id");
    }
    const planId = new Types.ObjectId(planIdRaw);

    const plan = await PlanModel.findById(planId).lean();
    if (!plan) {
      throw new Error("Plan not found");
    }
    if (!plan.isActive) {
      throw new Error("Plan is not available for purchase");
    }
    if (!isPurchasablePrice(plan.pricePerMonth)) {
      throw new Error(
        "Plan is not purchasable online (requires contact or invalid price)",
      );
    }

    const user = await UserModel.findById(userId).select("email").lean();
    if (!user?.email) {
      throw new Error("User not found");
    }

    await this.expireStalePendingForUser(userId);

    const now = new Date();
    const existing = await InvoiceModel.findOne({
      userId,
      status: "pending",
      expiresAt: { $gt: now },
    });

    if (existing) {
      if (
        (existing.type ?? "plan_purchase") === "plan_purchase" &&
        existing.planId != null &&
        existing.planId.equals(planId)
      ) {
        if (!existing.snapToken) {
          await this.attachSnapSession(existing, user.email, plan.name);
        }
        const fresh = await InvoiceModel.findById(existing._id).lean<InvoiceLean>();
        if (!fresh) throw new Error("Invoice not found");
        return this.toOutDto(fresh, plan.name);
      }

      existing.status = "cancelled";
      existing.purgeAt = purgeAtFromNow(now);
      await existing.save();
      if (existing.snapToken) {
        void midtransService.cancelSnapSession(existing.snapToken);
      }
    }

    return this.insertPendingInvoice({
      userId,
      planId,
      type: "plan_purchase",
      listPrice: plan.pricePerMonth,
      amount: plan.pricePerMonth,
      startMode: "after_current",
      planName: plan.name,
      email: user.email,
      createSnap: true,
    });
  }

  private async insertPendingInvoice(input: {
    userId: Types.ObjectId;
    planId: Types.ObjectId | null;
    type: InvoiceTypeDto;
    listPrice: number;
    amount: number;
    startMode?: InvoiceStartModeDto | null;
    targetPeriodId?: Types.ObjectId | null;
    deepseekTokens?: number | null;
    createdByAdminId?: Types.ObjectId | null;
    planName: string | null;
    email: string;
    createSnap: boolean;
  }): Promise<InvoiceOutDto> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.invoiceTtlMinutes * 60_000);
    const itemLabel = invoiceItemLabel(
      input.type,
      input.planName,
      input.deepseekTokens ?? null,
    );

    let created: InvoiceDoc;
    try {
      created = await InvoiceModel.create({
        userId: input.userId,
        planId: input.planId,
        type: input.type,
        listPrice: input.listPrice,
        amount: input.amount,
        status: "pending",
        expiresAt,
        startMode: input.startMode ?? null,
        targetPeriodId: input.targetPeriodId ?? null,
        deepseekTokens: input.deepseekTokens ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      return this.resolveDuplicateInsert({
        userId: input.userId,
        planId: input.planId,
        amount: input.amount,
        planName: input.planName,
        email: input.email,
        type: input.type,
        deepseekTokens: input.deepseekTokens ?? null,
        listPrice: input.listPrice,
        startMode: input.startMode ?? null,
        targetPeriodId: input.targetPeriodId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      });
    }

    if (input.createSnap && input.amount > 0) {
      try {
        await this.attachSnapSession(created, input.email, itemLabel);
      } catch (err) {
        created.status = "failed";
        created.purgeAt = purgeAtFromNow();
        await created.save();
        throw err instanceof Error
          ? err
          : new Error("Payment provider failed to create checkout session");
      }
    }

    const fresh = await InvoiceModel.findById(created._id).lean<InvoiceLean>();
    if (!fresh) throw new Error("Invoice not found");
    return this.toOutDto(fresh, input.planName);
  }

  private async resolveDuplicateInsert(input: {
    userId: Types.ObjectId;
    planId: Types.ObjectId | null;
    amount: number;
    planName: string | null;
    email: string;
    type: InvoiceTypeDto;
    deepseekTokens: number | null;
    listPrice: number;
    startMode?: InvoiceStartModeDto | null;
    targetPeriodId?: Types.ObjectId | null;
    createdByAdminId?: Types.ObjectId | null;
  }): Promise<InvoiceOutDto> {
    await this.expireStalePendingForUser(input.userId);
    const conflict = await InvoiceModel.findOne({
      userId: input.userId,
      status: "pending",
    });
    const retry = () =>
      this.insertPendingInvoice({
        userId: input.userId,
        planId: input.planId,
        type: input.type,
        listPrice: input.listPrice,
        amount: input.amount,
        startMode: input.startMode ?? null,
        targetPeriodId: input.targetPeriodId ?? null,
        deepseekTokens: input.deepseekTokens,
        createdByAdminId: input.createdByAdminId ?? null,
        planName: input.planName,
        email: input.email,
        createSnap: input.amount > 0,
      });
    if (!conflict) {
      return retry();
    }
    if (conflict.expiresAt.getTime() <= Date.now()) {
      conflict.status = "expired";
      conflict.purgeAt = purgeAtFromNow();
      await conflict.save();
      return retry();
    }
    const samePlan =
      input.type === "plan_purchase" &&
      input.planId != null &&
      conflict.planId != null &&
      conflict.planId.equals(input.planId) &&
      (conflict.type ?? "plan_purchase") === "plan_purchase";
    const sameTopup =
      input.type === "token_topup" &&
      (conflict.type ?? "plan_purchase") === "token_topup";
    if (samePlan || sameTopup) {
      const itemLabel = invoiceItemLabel(
        input.type,
        input.planName,
        input.deepseekTokens,
      );
      if (!conflict.snapToken && conflict.amount > 0) {
        await this.attachSnapSession(conflict, input.email, itemLabel);
      }
      const fresh = await InvoiceModel.findById(conflict._id).lean<InvoiceLean>();
      if (!fresh) throw new Error("Invoice not found");
      return this.toOutDto(fresh, input.planName);
    }
    conflict.status = "cancelled";
    conflict.purgeAt = purgeAtFromNow();
    await conflict.save();
    if (conflict.snapToken) {
      void midtransService.cancelSnapSession(conflict.snapToken);
    }
    return retry();
  }

  private async attachSnapSession(
    invoice: InvoiceDoc,
    email: string,
    itemLabel: string,
  ): Promise<void> {
    const type = (invoice.type ?? "plan_purchase") as InvoiceTypeDto;
    const snapName =
      type === "token_topup" ? itemLabel : `${itemLabel} (1 month)`;
    const snap = await midtransService.createSnapTransaction({
      orderId: invoice._id.toString(),
      grossAmount: invoice.amount,
      customerEmail: email,
      planId: invoice.planId?.toString() ?? "token-topup",
      planName: snapName,
      expiryMinutes: remainingExpiryMinutes(invoice.expiresAt),
    });
    invoice.snapToken = snap.token;
    await invoice.save();
  }

  async handleNotification(
    payload: MidtransNotificationPayload,
  ): Promise<{ status: number; message: string }> {
    if (!midtransService.verifySignature(payload)) {
      logger.warn(
        `Invalid Midtrans signature for order ${String(payload.order_id ?? "")}`,
        "invoice.service",
        "handleNotification",
      );
      return { status: 403, message: "Invalid signature" };
    }

    const orderId = payload.order_id;
    if (typeof orderId !== "string" || !Types.ObjectId.isValid(orderId)) {
      logger.error(
        `Midtrans notification with unknown/invalid order_id=${String(orderId)} status=${String(payload.transaction_status)}`,
        "invoice.service",
        "handleNotification",
      );
      return { status: 200, message: "Ignored unknown order" };
    }

    const invoice = await InvoiceModel.findById(orderId);
    if (!invoice) {
      logger.error(
        `Midtrans notification for missing invoice order_id=${orderId} status=${String(payload.transaction_status)}`,
        "invoice.service",
        "handleNotification",
      );
      return { status: 200, message: "Invoice not found" };
    }

    return this.applyMidtransStatus(invoice, payload, "webhook");
  }

  /**
   * Shared webhook + poll status application (idempotent).
   * Signature verification is the caller's responsibility (webhook only).
   */
  async applyMidtransStatus(
    invoice: InvoiceDoc,
    payload: MidtransNotificationPayload,
    source: MidtransStatusSource,
  ): Promise<{ status: number; message: string }> {
    const orderId = invoice._id.toString();

    if (
      typeof payload.order_id === "string" &&
      payload.order_id !== orderId
    ) {
      logger.error(
        `order_id mismatch source=${source} invoice=${orderId} midtrans=${payload.order_id}`,
        "invoice.service",
        "applyMidtransStatus",
      );
      invoice.needsManualReview = true;
      await invoice.save();
      return { status: 200, message: "Order id mismatch flagged" };
    }

    const grossRaw = payload.gross_amount;
    if (typeof grossRaw === "string" && grossRaw.length > 0) {
      const grossNum = Number(grossRaw);
      if (!Number.isFinite(grossNum) || grossNum !== invoice.amount) {
        logger.error(
          `Amount mismatch source=${source} invoice=${orderId}: midtrans=${grossRaw} invoice=${invoice.amount}`,
          "invoice.service",
          "applyMidtransStatus",
        );
        invoice.needsManualReview = true;
        if (typeof payload.transaction_status === "string") {
          invoice.midtransTransactionStatus = payload.transaction_status;
        }
        await invoice.save();
        return { status: 200, message: "Amount mismatch flagged" };
      }
    }

    const txStatus =
      typeof payload.transaction_status === "string"
        ? payload.transaction_status
        : "";
    const fraudStatus =
      typeof payload.fraud_status === "string" ? payload.fraud_status : "";
    const statusCode =
      typeof payload.status_code === "string" ? payload.status_code : "";

    if (typeof payload.transaction_status === "string") {
      invoice.midtransTransactionStatus = payload.transaction_status;
    }
    if (typeof payload.payment_type === "string") {
      invoice.midtransPaymentType = payload.payment_type;
    }
    if (typeof payload.transaction_id === "string") {
      invoice.midtransTransactionId = payload.transaction_id;
    }

    const shouldPay =
      txStatus === "settlement" ||
      (txStatus === "capture" &&
        fraudStatus === "accept" &&
        statusCode === "200");

    if (shouldPay) {
      await invoice.save();
      await this.markPaidAndActivate(invoice._id, payload, source);
      return { status: 200, message: "Payment processed" };
    }

    // Never move a paid invoice backwards (except refund path below).
    // Re-read status from DB in case markPaid raced (narrows TS after shouldPay).
    const currentStatus = invoice.status;
    if (currentStatus === "paid") {
      const effectDone =
        (invoice.effectAppliedAt &&
          invoice.effectAppliedAt.getTime() > 0) ||
        (invoice.activatedAt && invoice.activatedAt.getTime() > 0);
      if (!effectDone) {
        await this.applyPaidInvoice(invoice._id);
      } else {
        await invoice.save();
      }
      return { status: 200, message: "Already paid" };
    }

    if (txStatus === "pending") {
      await invoice.save();
      return { status: 200, message: "Pending" };
    }

    if (txStatus === "expire") {
      invoice.status = "expired";
      invoice.purgeAt = purgeAtFromNow();
      await invoice.save();
      return { status: 200, message: "Expired" };
    }

    if (txStatus === "cancel") {
      invoice.status = "cancelled";
      invoice.purgeAt = purgeAtFromNow();
      await invoice.save();
      return { status: 200, message: "Cancelled" };
    }

    if (txStatus === "deny" || txStatus === "failure") {
      invoice.status = "failed";
      invoice.purgeAt = purgeAtFromNow();
      await invoice.save();
      return { status: 200, message: "Failed" };
    }

    if (
      txStatus === "refund" ||
      txStatus === "partial_refund" ||
      txStatus === "chargeback"
    ) {
      invoice.status = "refunded";
      await invoice.save();
      logger.error(
        `Refund/chargeback source=${source} invoice=${orderId}   manual handling required`,
        "invoice.service",
        "applyMidtransStatus",
      );
      return { status: 200, message: "Refund recorded" };
    }

    if (txStatus === "capture") {
      invoice.needsManualReview = true;
      await invoice.save();
      logger.warn(
        `Capture without accept source=${source} invoice=${orderId} fraud=${fraudStatus}`,
        "invoice.service",
        "applyMidtransStatus",
      );
      return { status: 200, message: "Capture flagged" };
    }

    await invoice.save();
    return { status: 200, message: "Ignored" };
  }

  /** Apply a successful Get Status result (poll helper). */
  async applyStatusResult(
    invoice: InvoiceDoc,
    data: MidtransStatusResult,
    source: MidtransStatusSource = "poll",
  ): Promise<{ status: number; message: string }> {
    return this.applyMidtransStatus(
      invoice,
      midtransService.statusResultToPayload(data),
      source,
    );
  }

  private async markPaidAndActivate(
    invoiceId: Types.ObjectId,
    payload: MidtransNotificationPayload,
    source: MidtransStatusSource,
  ): Promise<void> {
    const now = new Date();
    const before = await InvoiceModel.findById(invoiceId);
    if (!before) return;

    if (before.status === "expired" || before.status === "cancelled") {
      logger.warn(
        `Late payment on ${before.status} invoice ${invoiceId.toString()} source=${source}   still activating`,
        "invoice.service",
        "markPaidAndActivate",
      );
    }

    const updated = await InvoiceModel.findOneAndUpdate(
      {
        _id: invoiceId,
        status: { $ne: "paid" },
      },
      {
        $set: {
          status: "paid",
          paidAt: now,
          midtransTransactionStatus:
            typeof payload.transaction_status === "string"
              ? payload.transaction_status
              : before.midtransTransactionStatus,
          midtransPaymentType:
            typeof payload.payment_type === "string"
              ? payload.payment_type
              : before.midtransPaymentType,
          midtransTransactionId:
            typeof payload.transaction_id === "string"
              ? payload.transaction_id
              : before.midtransTransactionId,
        },
        $unset: { purgeAt: 1 },
      },
      { returnDocument: "after" },
    );

    if (updated && source === "poll") {
      logger.info(
        `Payment confirmed by poll orderId=${invoiceId.toString()} source=poll`,
        "invoice.service",
        "markPaidAndActivate",
      );
    }

    // Winner applies effects; loser may still need apply if crash left paid without claim
    const needsApply =
      updated ||
      !before.effectAppliedAt ||
      before.effectAppliedAt.getTime() === 0 ||
      !before.activatedAt ||
      before.activatedAt.getTime() === 0;
    if (needsApply) {
      await this.applyPaidInvoice(invoiceId);
    }
  }

  /** @deprecated Use applyPaidInvoice — kept for call-site compatibility. */
  async activateIfNeeded(invoiceId: Types.ObjectId): Promise<void> {
    return this.applyPaidInvoice(invoiceId);
  }

  /**
   * Idempotent paid side-effects: plan period create or token topup.
   * Guarded by effectAppliedAt (CLAIM epoch + stale reclaim).
   */
  async applyPaidInvoice(invoiceId: Types.ObjectId): Promise<void> {
    const CLAIM = new Date(0);
    const staleBefore = new Date(Date.now() - 60_000);
    const invoice = await InvoiceModel.findOneAndUpdate(
      {
        _id: invoiceId,
        status: "paid",
        $and: [
          {
            $or: [
              { effectAppliedAt: null },
              { effectAppliedAt: { $exists: false } },
              { effectAppliedAt: CLAIM, updatedAt: { $lte: staleBefore } },
            ],
          },
          // Skip legacy invoices that already completed activation.
          {
            $or: [
              { activatedAt: null },
              { activatedAt: { $exists: false } },
              { activatedAt: CLAIM },
              { activatedAt: { $lte: CLAIM } },
            ],
          },
        ],
      },
      { $set: { effectAppliedAt: CLAIM, activatedAt: CLAIM } },
      { returnDocument: "after" },
    );
    if (!invoice) return;

    try {
      const type = invoice.type ?? "plan_purchase";
      let mailPeriod: { effectiveDate: Date; untilDate: Date } | null = null;

      if (type === "token_topup") {
        await this.applyTokenTopupEffect(invoice);
      } else {
        mailPeriod = await this.applyPlanPurchaseEffect(invoice);
      }

      const doneAt = new Date();
      await InvoiceModel.updateOne(
        { _id: invoiceId, effectAppliedAt: CLAIM },
        { $set: { effectAppliedAt: doneAt, activatedAt: doneAt } },
      );

      if (type === "plan_purchase" && mailPeriod) {
        try {
          const [user, planName] = await Promise.all([
            UserModel.findById(invoice.userId).select("email").lean(),
            planNameById(invoice.planId),
          ]);
          const email = user?.email?.trim();
          if (email) {
            const invoiceIdStr = invoiceId.toString();
            const filename = `invoice-${invoiceIdStr}.pdf`;
            const paidPlanName = planName ?? "Plan";
            const pdfBuffer = await this.buildInvoicePdfBuffer({
              id: invoiceIdStr,
              planName: paidPlanName,
              amount: invoice.amount,
              status: "paid",
              expiresAt: invoice.expiresAt,
              paidAt: invoice.paidAt ?? new Date(),
              createdAt: invoice.createdAt ?? new Date(),
              isPaid: true,
              paymentPageUrl: null,
              customerEmail: email,
            });
            await mailer.sendPaymentActivated(email, {
              planName: paidPlanName,
              effectiveDate: mailPeriod.effectiveDate,
              untilDate: mailPeriod.untilDate,
              amount: invoice.amount,
              invoiceId: invoiceIdStr,
              invoicePdf: pdfBuffer,
              invoiceFilename: filename,
            });
          }
        } catch (mailErr) {
          logger.error(
            `Payment receipt email failed for invoice ${invoiceId.toString()}: ${mailErr instanceof Error ? mailErr.message : "unknown"}`,
            "invoice.service",
            "applyPaidInvoice",
          );
        }
      }
    } catch (err) {
      await InvoiceModel.updateOne(
        { _id: invoiceId, effectAppliedAt: CLAIM },
        { $unset: { effectAppliedAt: 1, activatedAt: 1 } },
      );
      logger.error(
        `Paid effect failed for invoice ${invoiceId.toString()}: ${err instanceof Error ? err.message : "unknown"}`,
        "invoice.service",
        "applyPaidInvoice",
      );
      throw err;
    }
  }

  private async applyPlanPurchaseEffect(
    invoice: InvoiceDoc,
  ): Promise<{ effectiveDate: Date; untilDate: Date }> {
    if (!invoice.planId) {
      throw new Error("plan_purchase invoice missing planId");
    }
    const startMode = invoice.startMode ?? "after_current";
    const period =
      startMode === "immediate"
        ? await this.computeImmediatePeriod()
        : await this.computePaidPeriod(invoice.userId);

    await userPlanPeriodService.addPeriods(
      invoice.userId,
      {
        periods: [
          {
            planId: invoice.planId.toString(),
            effectiveDate: period.effectiveDate.toISOString(),
            untilDate: period.untilDate.toISOString(),
          },
        ],
        preserveRemainder: false,
      },
      invoice.createdByAdminId ?? null,
    );
    return period;
  }

  private async applyTokenTopupEffect(invoice: InvoiceDoc): Promise<void> {
    const tokens = invoice.deepseekTokens;
    if (typeof tokens !== "number" || !Number.isInteger(tokens) || tokens === 0) {
      throw new Error("token_topup invoice missing deepseekTokens");
    }

    const now = new Date();
    let targetId = invoice.targetPeriodId ?? null;
    let reason = `Token top-up invoice ${invoice._id.toString()}`;

    if (targetId) {
      const target = await UserPlanPeriodModel.findOne({
        _id: targetId,
        userId: invoice.userId,
      }).lean();
      if (!target || target.untilDate.getTime() <= now.getTime()) {
        const current = await userPlanPeriodService.findPeriodContainingNow(
          invoice.userId,
          now,
        );
        if (!current) {
          throw new Error(
            "Target period ended and user has no current period for token top-up. Add an active plan period, then retry Mark paid.",
          );
        }
        reason = `${reason} (target period ${targetId.toString()} ended before payment; applied to current period ${current._id.toString()})`;
        targetId = current._id;
      }
    } else {
      const current = await userPlanPeriodService.findPeriodContainingNow(
        invoice.userId,
        now,
      );
      if (!current) {
        throw new Error(
          "No current period for token top-up. Add an active plan period, then retry Mark paid.",
        );
      }
      targetId = current._id;
      reason = `${reason} (no targetPeriodId; applied to current period)`;
    }

    await userPlanPeriodService.applyInvoiceTokenTopup(
      targetId,
      tokens,
      invoice._id,
      reason,
    );
  }

  async computeImmediatePeriod(): Promise<{
    effectiveDate: Date;
    untilDate: Date;
  }> {
    const effectiveDate = new Date();
    return {
      effectiveDate,
      untilDate: addCalendarMonths(effectiveDate, 1),
    };
  }

  /**
   * Stacking: if latest period still in the future (and not never-expire),
   * start at its untilDate; otherwise start now. Duration = 1 calendar month.
   */
  async computePaidPeriod(
    userId: Types.ObjectId,
  ): Promise<{ effectiveDate: Date; untilDate: Date }> {
    const now = new Date();
    const latest = await UserPlanPeriodModel.findOne({ userId })
      .sort({ untilDate: -1 })
      .lean();

    let effectiveDate = now;
    if (
      latest &&
      !isNeverUntil(latest.untilDate) &&
      latest.untilDate.getTime() > now.getTime()
    ) {
      effectiveDate = latest.untilDate;
    }

    return {
      effectiveDate,
      untilDate: addCalendarMonths(effectiveDate, 1),
    };
  }

  async createAdminInvoice(
    userId: Types.ObjectId,
    input: CreateAdminInvoiceDto,
    adminUserId: Types.ObjectId,
  ): Promise<InvoiceOutDto> {
    const user = await UserModel.findById(userId).select("email").lean();
    if (!user?.email) throw new Error("User not found");

    await this.expireStalePendingForUser(userId);

    const now = new Date();
    const existing = await InvoiceModel.findOne({
      userId,
      status: "pending",
      expiresAt: { $gt: now },
    });

    if (existing) {
      if (!input.expirePendingAndContinue) {
        throw new PendingInvoiceConflictError(existing._id.toString());
      }
      existing.status = "cancelled";
      existing.purgeAt = purgeAtFromNow(now);
      await existing.save();
      if (existing.snapToken) {
        void midtransService.cancelSnapSession(existing.snapToken);
      }
    }

    let targetPeriodId: Types.ObjectId | null = null;
    let deepseekTokens: number | null = null;
    let startMode: InvoiceStartModeDto | null = null;
    let planId: Types.ObjectId | null = null;
    let planName: string | null = null;
    let listPrice = 0;

    if (input.type === "token_topup") {
      if (!input.targetPeriodId || !Types.ObjectId.isValid(input.targetPeriodId)) {
        throw new Error("targetPeriodId is required");
      }
      targetPeriodId = new Types.ObjectId(input.targetPeriodId);
      const target = await UserPlanPeriodModel.findOne({
        _id: targetPeriodId,
        userId,
      }).lean();
      if (!target) throw new Error("Target period not found");
      if (target.untilDate.getTime() <= now.getTime()) {
        throw new Error("targetPeriodId has already ended");
      }
      const targetIsCurrent =
        target.effectiveDate.getTime() <= now.getTime() &&
        target.untilDate.getTime() > now.getTime();
      const targetIsUpcoming = target.effectiveDate.getTime() > now.getTime();
      if (targetIsUpcoming && !input.allowFuturePeriod) {
        throw new Error(
          "targetPeriodId is not the current period; pass allowFuturePeriod=true to top up an upcoming period",
        );
      }
      if (!targetIsCurrent && !targetIsUpcoming) {
        throw new Error("targetPeriodId has already ended");
      }
      if (
        typeof input.deepseekTokens !== "number" ||
        !Number.isInteger(input.deepseekTokens) ||
        input.deepseekTokens === 0
      ) {
        throw new Error("deepseekTokens must be a non-zero integer");
      }
      deepseekTokens = input.deepseekTokens;
      // Token top-ups are not plan sales — no planId / planName.
      planId = null;
      planName = null;
      listPrice = 0;
    } else {
      if (!input.planId || !Types.ObjectId.isValid(input.planId)) {
        throw new Error("planId is required for plan_purchase");
      }
      planId = new Types.ObjectId(input.planId);
      startMode = input.startMode ?? "after_current";
      const plan = await PlanModel.findById(planId).lean();
      if (!plan) throw new Error("Plan not found");
      planName = plan.name;
      listPrice =
        typeof plan.pricePerMonth === "number" &&
        Number.isFinite(plan.pricePerMonth)
          ? Math.max(0, Math.trunc(plan.pricePerMonth))
          : 0;
    }

    const amount =
      input.amount !== undefined
        ? input.amount
        : input.type === "token_topup"
          ? 0
          : listPrice;
    if (!isValidAmount(amount)) {
      throw new Error("amount must be a non-negative integer");
    }

    return this.insertPendingInvoice({
      userId,
      planId,
      type: input.type,
      listPrice,
      amount,
      startMode,
      targetPeriodId,
      deepseekTokens,
      createdByAdminId: adminUserId,
      planName,
      email: user.email,
      createSnap: amount > 0,
    });
  }

  async listForAdminUser(
    userId: Types.ObjectId,
  ): Promise<InvoiceOutDto[]> {
    const rows = await InvoiceModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<InvoiceLean[]>();
    const names = new Map<string, string | null>();
    const result: InvoiceOutDto[] = [];
    for (const row of rows) {
      const type = (row.type ?? "plan_purchase") as InvoiceTypeDto;
      if (type === "token_topup") {
        result.push(await this.toOutDto(row, null));
        continue;
      }
      const key = row.planId?.toString() ?? "";
      if (key && !names.has(key)) {
        names.set(key, await planNameById(row.planId));
      }
      result.push(await this.toOutDto(row, names.get(key) ?? "Plan"));
    }
    return result;
  }

  async markPaidManually(
    invoiceId: Types.ObjectId,
    note: string,
    adminUserId: Types.ObjectId,
  ): Promise<InvoiceOutDto> {
    const trimmed = note.trim();
    if (!trimmed) throw new Error("note is required");

    const invoice = await InvoiceModel.findById(invoiceId);
    if (!invoice) throw new Error("Invoice not found");

    if (invoice.status === "paid") {
      await this.applyPaidInvoice(invoice._id);
      const planName = await planNameById(invoice.planId);
      const fresh = await InvoiceModel.findById(invoice._id).lean<InvoiceLean>();
      if (!fresh) throw new Error("Invoice not found");
      return this.toOutDto(fresh, planName);
    }

    if (invoice.status !== "pending") {
      throw new Error(`Cannot mark ${invoice.status} invoice as paid`);
    }

    if (invoice.snapToken) {
      try {
        const status = await midtransService.getTransactionStatus(
          invoice._id.toString(),
        );
        if (
          status.kind === "ok" &&
          (status.data.transactionStatus === "settlement" ||
            status.data.transactionStatus === "capture")
        ) {
          await this.markPaidAndActivate(
            invoice._id,
            midtransService.statusResultToPayload(status.data),
            "poll",
          );
          const planName = await planNameById(invoice.planId);
          const fresh = await InvoiceModel.findById(invoice._id).lean<InvoiceLean>();
          if (!fresh) throw new Error("Invoice not found");
          return this.toOutDto(fresh, planName);
        }
      } catch (err) {
        logger.warn(
          `Manual mark-paid Midtrans status check failed: ${err instanceof Error ? err.message : "unknown"}`,
          "invoice.service",
          "markPaidManually",
        );
      }
      void midtransService.cancelSnapSession(invoice.snapToken);
    }

    const now = new Date();
    const updated = await InvoiceModel.findOneAndUpdate(
      { _id: invoiceId, status: "pending" },
      {
        $set: {
          status: "paid",
          paidAt: now,
          manualPaidNote: trimmed,
          manualPaidByAdminUserId: adminUserId,
          midtransTransactionStatus: "manual",
        },
        $unset: { purgeAt: 1, snapToken: 1 },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      const again = await InvoiceModel.findById(invoiceId);
      if (again?.status === "paid") {
        await this.applyPaidInvoice(invoiceId);
        const planName = await planNameById(again.planId);
        const fresh = await InvoiceModel.findById(invoiceId).lean<InvoiceLean>();
        if (!fresh) throw new Error("Invoice not found");
        return this.toOutDto(fresh, planName);
      }
      throw new Error("Invoice is no longer pending");
    }

    await this.applyPaidInvoice(invoiceId);
    const planName = await planNameById(updated.planId);
    const fresh = await InvoiceModel.findById(invoiceId).lean<InvoiceLean>();
    if (!fresh) throw new Error("Invoice not found");
    return this.toOutDto(fresh, planName);
  }
}

export const invoiceService = new InvoiceService();

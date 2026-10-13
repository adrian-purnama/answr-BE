import { model, Schema, Types } from "mongoose";
import {
  INVOICE_START_MODES,
  INVOICE_STATUSES,
  INVOICE_TYPES,
  type InvoiceInterface,
} from "./invoice.interface";

const InvoiceSchema = new Schema<InvoiceInterface>(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    planId: {
      type: Types.ObjectId,
      ref: "Plan",
      required: false,
      default: null,
    },
    type: {
      type: String,
      enum: INVOICE_TYPES,
      required: true,
      default: "plan_purchase",
    },
    listPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      required: true,
      default: "pending",
    },
    startMode: {
      type: String,
      enum: INVOICE_START_MODES,
      required: false,
      default: null,
    },
    targetPeriodId: {
      type: Types.ObjectId,
      ref: "UserPlanPeriod",
      required: false,
      default: null,
    },
    deepseekTokens: {
      type: Number,
      required: false,
      default: null,
    },
    createdByAdminId: {
      type: Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    manualPaidNote: {
      type: String,
      required: false,
      default: null,
      trim: true,
    },
    manualPaidByAdminUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    snapToken: {
      type: String,
      required: false,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    paidAt: {
      type: Date,
      required: false,
      default: null,
    },
    activatedAt: {
      type: Date,
      required: false,
      default: null,
    },
    effectAppliedAt: {
      type: Date,
      required: false,
      default: null,
    },
    purgeAt: {
      type: Date,
      required: false,
      default: null,
    },
    midtransTransactionStatus: {
      type: String,
      required: false,
      default: null,
    },
    midtransPaymentType: {
      type: String,
      required: false,
      default: null,
    },
    midtransTransactionId: {
      type: String,
      required: false,
      default: null,
    },
    needsManualReview: {
      type: Boolean,
      required: false,
      default: false,
    },
    lastPolledAt: {
      type: Date,
      required: false,
      default: null,
    },
    pollCount: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

/** One pending invoice per user (active or stale until expired by app logic). */
InvoiceSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

/** MongoDB deletes docs only when purgeAt is set and due. */
InvoiceSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

InvoiceSchema.index({ userId: 1, status: 1, expiresAt: 1 });

/** Background poller: find pending invoices by last poll time. */
InvoiceSchema.index({ status: 1, lastPolledAt: 1 });

export const InvoiceModel = model<InvoiceInterface>("Invoice", InvoiceSchema);

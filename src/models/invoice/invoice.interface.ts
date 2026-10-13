import { Types } from "mongoose";

export const INVOICE_STATUSES = [
  "pending",
  "paid",
  "expired",
  "failed",
  "cancelled",
  "refunded",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TYPES = ["plan_purchase", "token_topup"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_START_MODES = ["immediate", "after_current"] as const;
export type InvoiceStartMode = (typeof INVOICE_START_MODES)[number];

export interface InvoiceInterface {
  userId: Types.ObjectId;
  /**
   * Required for plan_purchase. Null for token_topup (not a plan sale).
   */
  planId?: Types.ObjectId | null;
  type: InvoiceType;
  /** Plan catalog price at creation (IDR). 0 for token_topup unless overridden. */
  listPrice: number;
  /** Integer IDR actually charged (may be overridden by admin). */
  amount: number;
  status: InvoiceStatus;
  /** plan_purchase only. */
  startMode?: InvoiceStartMode | null;
  /** token_topup only. */
  targetPeriodId?: Types.ObjectId | null;
  /** token_topup only: per-window tokens to add. */
  deepseekTokens?: number | null;
  createdByAdminId?: Types.ObjectId | null;
  manualPaidNote?: string | null;
  manualPaidByAdminUserId?: Types.ObjectId | null;
  snapToken?: string | null;
  expiresAt: Date;
  paidAt?: Date | null;
  /** Set after subscription activation succeeds (legacy; prefer effectAppliedAt). */
  activatedAt?: Date | null;
  /** Idempotency claim for paid side-effects (plan period / token topup). */
  effectAppliedAt?: Date | null;
  /** TTL cleanup only for expired/failed/cancelled. Never set on paid/refunded. */
  purgeAt?: Date | null;
  midtransTransactionStatus?: string | null;
  midtransPaymentType?: string | null;
  midtransTransactionId?: string | null;
  /** Set when amount/signature anomalies need manual review. */
  needsManualReview?: boolean;
  /** Last Midtrans status poll (background or on-demand). */
  lastPolledAt?: Date | null;
  /** How many times this invoice was claimed for a Midtrans status poll. */
  pollCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InvoiceTypeDto = "plan_purchase" | "token_topup";
export type InvoiceStartModeDto = "immediate" | "after_current";

export interface CreateInvoiceDto {
  planId: string;
}

export interface CreateAdminInvoiceDto {
  type: InvoiceTypeDto;
  /** Required for plan_purchase. Ignored for token_topup (not a plan sale). */
  planId?: string;
  /** Charged amount. plan_purchase: omit to use plan list price. token_topup: omit for 0. */
  amount?: number;
  /** When true, expire any existing pending invoice for this user first. */
  expirePendingAndContinue?: boolean;
  startMode?: InvoiceStartModeDto;
  targetPeriodId?: string;
  deepseekTokens?: number;
  /**
   * token_topup only: allow targeting an upcoming (not-yet-current) period.
   * Default false — target must be the period containing now.
   */
  allowFuturePeriod?: boolean;
}

export interface MarkInvoicePaidDto {
  note: string;
}

/** Preview of the plan period that would be granted if this invoice is paid. */
export interface InvoiceSimulatedPeriodOutDto {
  planId: string;
  planName: string;
  effectiveDate: string;
  untilDate: string;
}

export interface InvoiceOutDto {
  id: string;
  userId: string;
  /** Null for token_topup invoices. */
  planId: string | null;
  /** Null for token_topup invoices. */
  planName: string | null;
  type: InvoiceTypeDto;
  listPrice: number;
  amount: number;
  status: string;
  startMode: InvoiceStartModeDto | null;
  targetPeriodId: string | null;
  deepseekTokens: number | null;
  createdByAdminId: string | null;
  manualPaidNote: string | null;
  snapToken: string | null;
  expiresAt: string;
  paidAt: string | null;
  activatedAt: string | null;
  effectAppliedAt: string | null;
  midtransTransactionStatus: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null once paid/terminal; for pending plan_purchase shows stacking preview. */
  simulatedPeriod: InvoiceSimulatedPeriodOutDto | null;
}

export interface InvoiceListOutDto {
  items: InvoiceOutDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MidtransClientConfigOutDto {
  clientKey: string;
  snapJsUrl: string;
  build: "development" | "production";
}

export interface PendingInvoiceConflictData {
  pendingInvoiceId: string;
  message: string;
}

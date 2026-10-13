import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { getMidtransUrls } from "./midtrans.config";

const REQUEST_TIMEOUT_MS = 15_000;
const STATUS_TIMEOUT_MS = 10_000;

export interface CreateSnapTransactionInput {
  orderId: string;
  grossAmount: number;
  customerEmail: string;
  planId: string;
  planName: string;
  /** Remaining minutes until invoice expiresAt (clamped to Midtrans min 5). */
  expiryMinutes: number;
}

export interface CreateSnapTransactionResult {
  token: string;
}

export interface MidtransNotificationPayload {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_id?: string;
  [key: string]: unknown;
}

export interface MidtransStatusResult {
  orderId: string;
  statusCode: string;
  transactionStatus: string;
  fraudStatus?: string;
  grossAmount: string;
  paymentType?: string;
  transactionId?: string;
}

export type GetTransactionStatusOutcome =
  | { kind: "ok"; data: MidtransStatusResult }
  | { kind: "not_found" }
  | { kind: "unauthorized" }
  | { kind: "retryable"; reason: string };

type FetchLike = typeof fetch;

export class MidtransService {
  private fetchImpl: FetchLike = fetch;

  /** Test seam   inject a mock fetch. */
  setFetch(fn: FetchLike): void {
    this.fetchImpl = fn;
  }

  resetFetch(): void {
    this.fetchImpl = fetch;
  }

  private authHeader(): string {
    const authString = Buffer.from(`${env.midtransServerKey}:`).toString(
      "base64",
    );
    return `Basic ${authString}`;
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { ok: res.ok, status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  async createSnapTransaction(
    input: CreateSnapTransactionInput,
  ): Promise<CreateSnapTransactionResult> {
    const { snapBaseUrl } = getMidtransUrls(env.build);
    const duration = Math.max(5, Math.trunc(input.expiryMinutes));

    const payload = {
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.grossAmount,
      },
      customer_details: {
        email: input.customerEmail,
      },
      item_details: [
        {
          id: input.planId,
          price: input.grossAmount,
          quantity: 1,
          // Callers pass the final display name (plan month vs token top-up).
          name: input.planName.slice(0, 50),
        },
      ],
      expiry: {
        unit: "minutes",
        duration,
      },
      page_expiry: {
        unit: "minutes",
        duration,
      },
      callbacks: {
        finish: `${env.frontendUrl.replace(/\/$/, "")}/dashboard`,
      },
    };

    const { ok, status, body } = await this.requestJson(
      `${snapBaseUrl}/snap/v1/transactions`,
      { method: "POST", body: JSON.stringify(payload) },
    );

    if (!ok) {
      logger.error(
        `Snap create failed (HTTP ${status})`,
        "midtrans.service",
        "createSnapTransaction",
      );
      throw new Error("Payment provider failed to create checkout session");
    }

    const data = body as { token?: string };
    if (typeof data.token !== "string" || !data.token) {
      logger.error(
        "Snap create returned unexpected response shape",
        "midtrans.service",
        "createSnapTransaction",
      );
      throw new Error("Payment provider failed to create checkout session");
    }

    return { token: data.token };
  }

  async getTransactionStatus(
    orderId: string,
  ): Promise<GetTransactionStatusOutcome> {
    const { coreBaseUrl } = getMidtransUrls(env.build);
    try {
      const { ok, status, body } = await this.requestJson(
        `${coreBaseUrl}/v2/${encodeURIComponent(orderId)}/status`,
        { method: "GET" },
        STATUS_TIMEOUT_MS,
      );

      if (status === 404) {
        logger.debug(
          `Get status 404 (not paid yet) for order ${orderId}`,
          "midtrans.service",
          "getTransactionStatus",
        );
        return { kind: "not_found" };
      }

      if (status === 401) {
        logger.error(
          `Get status 401 for order ${orderId}   check MIDTRANS_SERVER_KEY matches BUILD=${env.build}`,
          "midtrans.service",
          "getTransactionStatus",
        );
        return { kind: "unauthorized" };
      }

      if (!ok || status >= 500) {
        logger.warn(
          `Get status retryable HTTP ${status} for order ${orderId}`,
          "midtrans.service",
          "getTransactionStatus",
        );
        return { kind: "retryable", reason: `HTTP ${status}` };
      }

      const data = body as Record<string, unknown>;
      return {
        kind: "ok",
        data: {
          orderId: String(data.order_id ?? orderId),
          statusCode: String(data.status_code ?? ""),
          transactionStatus: String(data.transaction_status ?? ""),
          fraudStatus:
            typeof data.fraud_status === "string"
              ? data.fraud_status
              : undefined,
          grossAmount: String(data.gross_amount ?? ""),
          paymentType:
            typeof data.payment_type === "string"
              ? data.payment_type
              : undefined,
          transactionId:
            typeof data.transaction_id === "string"
              ? data.transaction_id
              : undefined,
        },
      };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "timeout"
          : err instanceof Error
            ? err.message
            : "network error";
      logger.warn(
        `Get status retryable for order ${orderId}: ${reason}`,
        "midtrans.service",
        "getTransactionStatus",
      );
      return { kind: "retryable", reason };
    }
  }

  statusResultToPayload(
    data: MidtransStatusResult,
  ): MidtransNotificationPayload {
    return {
      order_id: data.orderId,
      status_code: data.statusCode,
      gross_amount: data.grossAmount,
      transaction_status: data.transactionStatus,
      fraud_status: data.fraudStatus,
      payment_type: data.paymentType,
      transaction_id: data.transactionId,
    };
  }

  /**
   * Best-effort cancel of a Snap session. Failures are logged, never thrown.
   */
  async cancelSnapSession(snapToken: string): Promise<void> {
    if (!snapToken) return;
    const { snapBaseUrl } = getMidtransUrls(env.build);
    try {
      const { ok, status } = await this.requestJson(
        `${snapBaseUrl}/snap/v1/transactions/${encodeURIComponent(snapToken)}/cancel`,
        { method: "POST", body: "{}" },
      );
      if (!ok) {
        logger.warn(
          `Snap cancel returned HTTP ${status}`,
          "midtrans.service",
          "cancelSnapSession",
        );
      }
    } catch (err) {
      logger.warn(
        `Snap cancel failed: ${err instanceof Error ? err.message : "unknown"}`,
        "midtrans.service",
        "cancelSnapSession",
      );
    }
  }

  verifySignature(payload: MidtransNotificationPayload): boolean {
    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;

    if (
      typeof orderId !== "string" ||
      typeof statusCode !== "string" ||
      typeof grossAmount !== "string" ||
      typeof signatureKey !== "string"
    ) {
      return false;
    }

    const expected = createHash("sha512")
      .update(`${orderId}${statusCode}${grossAmount}${env.midtransServerKey}`)
      .digest("hex");

    try {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(signatureKey, "utf8");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

export const midtransService = new MidtransService();

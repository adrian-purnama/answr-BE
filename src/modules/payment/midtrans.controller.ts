import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type {
  InvoiceListOutDto,
  InvoiceOutDto,
  MidtransClientConfigOutDto,
} from "../../dto/invoice.dto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { requireUserId, statusForMessage } from "../../validation/http";
import {
  parseCreateInvoiceDto,
  parseInvoiceId,
  parseInvoiceListQuery,
} from "../../validation/invoice";
import { getMidtransUrls } from "./midtrans.config";
import { invoiceService } from "./invoice.service";
import type { MidtransNotificationPayload } from "./midtrans.service";

export class MidtransController {
  createInvoice = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const { planId } = parseCreateInvoiceDto(req.body);
      const data = await invoiceService.createOrReuse(userId, planId);
      return res.status(200).json({
        success: true,
        message: "Invoice ready",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create invoice";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getActiveInvoice = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const data = await invoiceService.getInvoiceStatusForUser(userId);
      return res.status(200).json({
        success: true,
        message: data ? "Invoice retrieved" : "No active invoice",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto | null>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get invoice";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listInvoices = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const { page, pageSize } = parseInvoiceListQuery(req.query);
      const data = await invoiceService.listForUser(userId, { page, pageSize });
      return res.status(200).json({
        success: true,
        message: "Invoices retrieved",
        data,
      } satisfies ApiResponseDto<InvoiceListOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list invoices";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getInvoice = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const id = parseInvoiceId(req.params.id);
      const data = await invoiceService.getForUser(userId, id);
      return res.status(200).json({
        success: true,
        message: "Invoice retrieved",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get invoice";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  exportInvoicePdf = async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const id = parseInvoiceId(req.params.id);
      const { buffer, filename } = await invoiceService.exportPdfForUser(
        userId,
        id,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return res.status(200).send(buffer);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export invoice";
      return res.status(statusForMessage(message)).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getClientConfig = async (_req: Request, res: Response) => {
    try {
      const urls = getMidtransUrls(env.build);
      return res.status(200).json({
        success: true,
        message: "Midtrans client config",
        data: {
          clientKey: env.midtransClientKey,
          snapJsUrl: urls.snapJsUrl,
          build: env.build,
        },
      } satisfies ApiResponseDto<MidtransClientConfigOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get client config";
      return res.status(500).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  notification = async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as MidtransNotificationPayload;
      const result = await invoiceService.handleNotification(payload);
      if (result.status === 403) {
        return res.status(403).json({
          success: false,
          message: result.message,
          data: null,
        } satisfies ApiResponseDto);
      }
      return res.status(200).json({
        success: true,
        message: result.message,
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : "Webhook handler failed",
        "midtrans.controller",
        "notification",
      );
      return res.status(500).json({
        success: false,
        message: "Temporary failure",
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

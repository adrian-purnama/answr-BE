import type { Request, Response } from "express";
import type {
  AdminUserDetailOutDto,
  AdminUserListOutDto,
  AdminUserOutDto,
} from "../../dto/adminUser.dto";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { PlanOutDto } from "../../dto/plan.dto";
import {
  parseUpdateAdminUserDto,
  parseUserListQuery,
} from "../../validation/adminUser";
import {
  parseCreatePlanDto,
  parseRouteId,
  parseUpdatePlanDto,
} from "../../validation/plan";
import type {
  InvoiceOutDto,
} from "../../dto/invoice.dto";
import type {
  AddPlanPeriodsResultOutDto,
  CurrentPeriodQuotaOutDto,
  PlanPeriodsPreviewOutDto,
  UserPlanPeriodOutDto,
  UserPlanTimelineOutDto,
} from "../../dto/userPlanPeriod.dto";
import {
  parseCreateAdminInvoiceDto,
  parseInvoiceId,
  parseMarkInvoicePaidDto,
} from "../../validation/invoice";
import {
  parseAddPlanPeriodsDto,
  parseAdjustPeriodTokensDto,
  parsePlanPeriodId,
  parsePlanPeriodListQuery,
} from "../../validation/userPlanPeriod";
import { PlanPeriodConflictError } from "../userPlanPeriod/planPeriodConflict.error";
import { PendingInvoiceConflictError } from "../payment/invoice.service";
import type {
  PlanPeriodSyncResult,
  PlanPeriodSyncStatus,
} from "../userPlanPeriod/planPeriodGap.worker";
import { AdminService } from "./admin.service";

type AppConfigPayload = {
  appName: string;
  openLogin: boolean;
  openRegister: boolean;
  appLogo: string | null;
};

export class AdminController {
  constructor(private readonly adminService = new AdminService()) {}

  getAppConfig = async (_req: Request, res: Response) => {
    try {
      const data = this.adminService.getAppConfig();

      return res.status(200).json({
        success: true,
        message: "App config retrieved",
        data,
      } satisfies ApiResponseDto<AppConfigPayload>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get app config",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateAppConfig = async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const patch: {
        appName?: string;
        openLogin?: boolean;
        openRegister?: boolean;
      } = {};

      if ("appName" in body) {
        if (typeof body.appName !== "string" || !body.appName.trim()) {
          return res.status(400).json({
            success: false,
            message: "appName must be a non-empty string",
            data: null,
          } satisfies ApiResponseDto);
        }
        patch.appName = body.appName.trim();
      }

      if ("openLogin" in body) {
        if (typeof body.openLogin !== "boolean") {
          return res.status(400).json({
            success: false,
            message: "openLogin must be a boolean",
            data: null,
          } satisfies ApiResponseDto);
        }
        patch.openLogin = body.openLogin;
      }

      if ("openRegister" in body) {
        if (typeof body.openRegister !== "boolean") {
          return res.status(400).json({
            success: false,
            message: "openRegister must be a boolean",
            data: null,
          } satisfies ApiResponseDto);
        }
        patch.openRegister = body.openRegister;
      }

      if (
        patch.appName === undefined &&
        patch.openLogin === undefined &&
        patch.openRegister === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "No valid fields to update",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await this.adminService.updateAppConfig(patch);

      return res.status(200).json({
        success: true,
        message: "App config updated",
        data,
      } satisfies ApiResponseDto<AppConfigPayload>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update app config",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateAppLogo = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "file required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const result = await this.adminService.updateAppLogo({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      return res.status(200).json({
        success: true,
        message: "App logo updated",
        data: {
          id: result.id.toString(),
          url: result.url,
        },
      } satisfies ApiResponseDto<{ id: string; url: string }>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update app logo",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getAllPlans = async (_req: Request, res: Response) => {
    try {
      const data = await this.adminService.getAllPlans();
      return res.status(200).json({
        success: true,
        message: "Plans retrieved",
        data,
      } satisfies ApiResponseDto<PlanOutDto[]>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get plans",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createPlan = async (req: Request, res: Response) => {
    try {
      const input = parseCreatePlanDto(req.body);
      const data = await this.adminService.createPlan(input);
      return res.status(201).json({
        success: true,
        message: "Plan created",
        data,
      } satisfies ApiResponseDto<PlanOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create plan",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updatePlan = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const patch = parseUpdatePlanDto(req.body);
      const data = await this.adminService.updatePlan(id, patch);
      return res.status(200).json({
        success: true,
        message: "Plan updated",
        data,
      } satisfies ApiResponseDto<PlanOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update plan",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  deletePlan = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      await this.adminService.deletePlan(id);
      return res.status(200).json({
        success: true,
        message: "Plan deleted",
        data: null,
      } satisfies ApiResponseDto);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to delete plan",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getUser = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const data = await this.adminService.getUserDetail(id);
      return res.status(200).json({
        success: true,
        message: "User retrieved",
        data,
      } satisfies ApiResponseDto<AdminUserDetailOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get user",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  searchUsers = async (req: Request, res: Response) => {
    try {
      const query = parseUserListQuery(req.query);
      const data = await this.adminService.listUsers(query);
      return res.status(200).json({
        success: true,
        message: "Users retrieved",
        data,
      } satisfies ApiResponseDto<AdminUserListOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to search users",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  updateUser = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const patch = parseUpdateAdminUserDto(req.body);
      const data = await this.adminService.updateUser(id, patch);
      return res.status(200).json({
        success: true,
        message: "User updated",
        data,
      } satisfies ApiResponseDto<AdminUserOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update user",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getPlanPeriodSyncStatus = async (_req: Request, res: Response) => {
    try {
      const data = this.adminService.getPlanPeriodSyncStatus();
      return res.status(200).json({
        success: true,
        message: "Plan period sync status retrieved",
        data,
      } satisfies ApiResponseDto<PlanPeriodSyncStatus>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get plan period sync status",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  runPlanPeriodSync = async (_req: Request, res: Response) => {
    try {
      const data = await this.adminService.runPlanPeriodSync();
      return res.status(200).json({
        success: true,
        message: data.skipped
          ? "Plan period sync already running"
          : `Plan period sync complete (${data.usersProcessed} users)`,
        data,
      } satisfies ApiResponseDto<PlanPeriodSyncResult>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to run plan period sync",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listPlanPeriods = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const query = parsePlanPeriodListQuery(req.query);
      const data = await this.adminService.listPlanPeriods(id, query);
      return res.status(200).json({
        success: true,
        message: "Plan periods retrieved",
        data,
      } satisfies ApiResponseDto<UserPlanTimelineOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to list plan periods",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getCurrentPeriodQuota = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const data = await this.adminService.getCurrentPeriodQuota(id);
      return res.status(200).json({
        success: true,
        message: data
          ? "Current period quota retrieved"
          : "No active plan period",
        data,
      } satisfies ApiResponseDto<CurrentPeriodQuotaOutDto | null>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get current period quota",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  adjustPeriodTokens = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const periodId = parsePlanPeriodId(req.params.periodId);
      const input = parseAdjustPeriodTokensDto(req.body);
      const data = await this.adminService.adjustPeriodTokens(
        id,
        periodId,
        input,
        req.user?._id ?? null,
      );
      return res.status(200).json({
        success: true,
        message: "Token adjustment applied",
        data,
      } satisfies ApiResponseDto<UserPlanPeriodOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to adjust period tokens",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  listUserInvoices = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const data = await this.adminService.listUserInvoices(id);
      return res.status(200).json({
        success: true,
        message: "Invoices retrieved",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto[]>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to list invoices",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  createUserInvoice = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const input = parseCreateAdminInvoiceDto(req.body);
      const adminId = req.user?._id;
      if (!adminId) throw new Error("Admin user required");
      const data = await this.adminService.createUserInvoice(
        id,
        input,
        adminId,
      );
      return res.status(201).json({
        success: true,
        message: "Invoice created",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto>);
    } catch (error) {
      if (error instanceof PendingInvoiceConflictError) {
        return res.status(409).json({
          success: false,
          message: error.message,
          data: { pendingInvoiceId: error.pendingInvoiceId },
        });
      }
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create invoice",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  markInvoicePaid = async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInvoiceId(req.params.invoiceId);
      const input = parseMarkInvoicePaidDto(req.body);
      const adminId = req.user?._id;
      if (!adminId) throw new Error("Admin user required");
      const data = await this.adminService.markInvoicePaid(
        invoiceId,
        input.note,
        adminId,
      );
      return res.status(200).json({
        success: true,
        message: "Invoice marked paid",
        data,
      } satisfies ApiResponseDto<InvoiceOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to mark invoice paid",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  previewPlanPeriods = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const input = parseAddPlanPeriodsDto(req.body);
      const data = await this.adminService.previewPlanPeriods(id, input);
      return res.status(200).json({
        success: true,
        message: "Plan periods preview",
        data,
      } satisfies ApiResponseDto<PlanPeriodsPreviewOutDto>);
    } catch (error) {
      if (error instanceof PlanPeriodConflictError) {
        return res.status(409).json({
          success: false,
          message: error.message,
          data: { conflict: error.conflict },
        });
      }
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to preview plan periods",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  addPlanPeriods = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const input = parseAddPlanPeriodsDto(req.body);
      const createdBy = req.user?._id ?? null;
      const data = await this.adminService.addPlanPeriods(id, input, createdBy);
      return res.status(201).json({
        success: true,
        message: "Plan periods added",
        data,
      } satisfies ApiResponseDto<AddPlanPeriodsResultOutDto>);
    } catch (error) {
      if (error instanceof PlanPeriodConflictError) {
        return res.status(409).json({
          success: false,
          message: error.message,
          data: { conflict: error.conflict },
        });
      }
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to add plan periods",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  removePlanPeriod = async (req: Request, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      const periodId = parsePlanPeriodId(req.params.periodId);
      const data = await this.adminService.removePlanPeriod(id, periodId);
      return res.status(200).json({
        success: true,
        message: "Plan period removed",
        data,
      } satisfies ApiResponseDto<UserPlanTimelineOutDto>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to remove plan period",
        data: null,
      } satisfies ApiResponseDto);
    }
  };

}

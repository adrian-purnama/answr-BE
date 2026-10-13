import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { DashboardOverviewOutDto } from "../../dto/dashboardOverview.dto";
import type { DeepseekUsageOutDto } from "../../dto/deepseekUsage.dto";
import type {
  UserPlanOutDto,
  UserPlanStatusOutDto,
} from "../../dto/userPlan.dto";
import { userService } from "./user.service";

export class UserController {
  getMyPlan = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await userService.getMyPlan(req.user._id);

      return res.status(200).json({
        success: true,
        message: "Plan retrieved",
        data,
      } satisfies ApiResponseDto<UserPlanOutDto>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve plan";
      const statusCode = message === "Plan not found" ? 404 : 400;

      return res.status(statusCode).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getMyPlanStatus = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await userService.getMyPlanStatus(req.user._id);

      return res.status(200).json({
        success: true,
        message: "Plan status retrieved",
        data,
      } satisfies ApiResponseDto<UserPlanStatusOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve plan status";
      const statusCode =
        message === "Plan not found" || message === "User not found"
          ? 404
          : 400;

      return res.status(statusCode).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getDeepseekUsage = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await userService.getDeepseekUsage(req.user._id);

      return res.status(200).json({
        success: true,
        message: "Deepseek usage retrieved",
        data,
      } satisfies ApiResponseDto<DeepseekUsageOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve Deepseek usage";
      const statusCode = message === "User not found" ? 404 : 400;

      return res.status(statusCode).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };

  getDashboardOverview = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await userService.getDashboardOverview(req.user._id);

      return res.status(200).json({
        success: true,
        message: "Dashboard overview retrieved",
        data,
      } satisfies ApiResponseDto<DashboardOverviewOutDto>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve dashboard overview";

      return res.status(400).json({
        success: false,
        message,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}


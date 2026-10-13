import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import type { PlanOutDto } from "../../dto/plan.dto";
import { planService } from "./plan.service";

export class PlanController {
  getPricingPlans = async (_req: Request, res: Response) => {
    try {
      const data = await planService.getPricingPlans();
      return res.status(200).json({
        success: true,
        message: "Pricing plans retrieved",
        data,
      } satisfies ApiResponseDto<PlanOutDto[]>);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get pricing plans",
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

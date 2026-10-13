import type { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import { appConfigService } from "./AppConfig.service";

export class AppConfigController {
  getBranding = (_req: Request, res: Response) => {
    const { appName, appLogo } = appConfigService.getAppConfig();

    return res.status(200).json({
      success: true,
      message: "Branding retrieved",
      data: { appName, appLogo },
    } satisfies ApiResponseDto<{ appName: string; appLogo: string | null }>);
  };
}

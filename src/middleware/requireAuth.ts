import type { NextFunction, Request, Response } from "express";
import { ApiResponseDto } from "../dto/apiResponse.dto";
import { logger } from "../logger/logger";
import { AuthError } from "./authenticate";

export function readBearer(req: Request): string {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function requireAuth<T>(
  authenticate: (token: string) => Promise<T>,
  attach: (req: Request, value: T) => void,
  invalidMessage: string,
  logSource: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      attach(req, await authenticate(readBearer(req)));
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          data: null,
        } satisfies ApiResponseDto);
      }

      logger.error(
        error instanceof Error ? error.message : String(error),
        logSource,
        "requireAuth",
      );

      return res.status(401).json({
        success: false,
        message: invalidMessage,
        data: null,
      } satisfies ApiResponseDto);
    }
  };
}

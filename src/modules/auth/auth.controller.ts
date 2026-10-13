import { Request, Response } from "express";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import { LoginInDto, LoginOutDto } from "../../dto/login.dto";
import { RegisterOutDto, registerInDto } from "../../dto/register.dto";
import { ResetPasswordOutDto } from "../../dto/resetPassword.dto";
import type { CreateVisitorJwtOutDto } from "../../dto/visitorJwt.dto";
import { isHttpError } from "../../utils/httpError";
import { normalizeEmail } from "../../utils/email";
import { AuthService, type SendOtpResult } from "./auth.service";

function errorStatus(error: unknown, fallback: number): number {
  if (isHttpError(error)) return error.statusCode;
  return fallback;
}

function errorBody(error: unknown, fallbackMessage: string): ApiResponseDto {
  const message =
    error instanceof Error ? error.message : fallbackMessage;
  const retryAfterSeconds = isHttpError(error)
    ? error.retryAfterSeconds
    : undefined;
  return {
    success: false,
    message,
    data: null,
    ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
  };
}

export class AuthController {
  constructor(private readonly authService = new AuthService()) {}

  sendOtp = async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Invalid email",
          data: null,
        } satisfies ApiResponseDto);
      }

      const isResetPassword = Boolean(req.body?.isResetPassword);

      const data = await this.authService.sendOtp({ email, isResetPassword });

      return res.status(200).json({
        success: true,
        message: "OTP sent",
        data,
      } satisfies ApiResponseDto<SendOtpResult>);
    } catch (error) {
      const status = errorStatus(error, 400);
      if (status === 429 && isHttpError(error) && error.retryAfterSeconds) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      return res
        .status(status)
        .json(errorBody(error, "Failed to send OTP"));
    }
  };

  register = async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Invalid email",
          data: null,
        } satisfies ApiResponseDto);
      }

      if (!otp || !password) {
        return res.status(400).json({
          success: false,
          message: "OTP and password are required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const input: registerInDto = { email, otp, password };
      const data = await this.authService.register(input);

      return res.status(201).json({
        success: true,
        message: "Registered successfully",
        data,
      } satisfies ApiResponseDto<RegisterOutDto>);
    } catch (error) {
      const status = errorStatus(error, 400);
      if (status === 429 && isHttpError(error) && error.retryAfterSeconds) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      return res
        .status(status)
        .json(errorBody(error, "Register failed"));
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";
      const rememberMe = Boolean(req.body?.rememberMe);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Invalid email",
          data: null,
        } satisfies ApiResponseDto);
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const input: LoginInDto = { email, password, rememberMe };
      const data = await this.authService.login(input);

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        data,
      } satisfies ApiResponseDto<LoginOutDto>);
    } catch (error) {
      const status = errorStatus(error, 401);
      if (status === 429 && isHttpError(error) && error.retryAfterSeconds) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      return res.status(status).json(errorBody(error, "Login failed"));
    }
  };

  validateUser = async (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: "Token is valid",
      data: { email: req.user!.email!, isAdmin: req.user!.isAdmin! },
    } satisfies ApiResponseDto<{ email: string; isAdmin: boolean }>);
  };

  createVisitorJwt = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
          data: null,
        } satisfies ApiResponseDto);
      }

      const publicKey =
        typeof req.body?.publicKey === "string"
          ? req.body.publicKey.trim()
          : "";
      if (!publicKey) {
        return res.status(400).json({
          success: false,
          message: "Widget public key is required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const claims =
        req.body?.claims &&
        typeof req.body.claims === "object" &&
        !Array.isArray(req.body.claims)
          ? (req.body.claims as Record<string, unknown>)
          : undefined;

      const expiresInSeconds =
        typeof req.body?.expiresInSeconds === "number"
          ? req.body.expiresInSeconds
          : undefined;

      const data = await this.authService.createVisitorJwt(
        req.user._id,
        req.user.email!,
        { publicKey, claims, expiresInSeconds },
        { isAdmin: Boolean(req.user.isAdmin) },
      );

      return res.status(200).json({
        success: true,
        message: "Visitor JWT created",
        data,
      } satisfies ApiResponseDto<CreateVisitorJwtOutDto>);
    } catch (error) {
      return res.status(400).json(errorBody(error, "Failed to create visitor JWT"));
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Invalid email",
          data: null,
        } satisfies ApiResponseDto);
      }

      if (!otp || !password) {
        return res.status(400).json({
          success: false,
          message: "OTP and password are required",
          data: null,
        } satisfies ApiResponseDto);
      }

      const data = await this.authService.resetPassword({
        email,
        otp,
        password,
      });

      return res.status(200).json({
        success: true,
        message: "Password reset successfully",
        data,
      } satisfies ApiResponseDto<ResetPasswordOutDto>);
    } catch (error) {
      const status = errorStatus(error, 400);
      if (status === 429 && isHttpError(error) && error.retryAfterSeconds) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      return res
        .status(status)
        .json(errorBody(error, "Password reset failed"));
    }
  };
}

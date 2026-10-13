import * as bcrypt from "bcrypt";
import { Types } from "mongoose";
import { registerInDto, RegisterOutDto } from "../../dto/register.dto";
import { LoginInDto, LoginOutDto } from "../../dto/login.dto";
import {
  ResetPasswordInDto,
  ResetPasswordOutDto,
} from "../../dto/resetPassword.dto";
import { SendOtpInDto } from "../../dto/sendOtp.dto";
import type {
  CreateVisitorJwtInDto,
  CreateVisitorJwtOutDto,
} from "../../dto/visitorJwt.dto";
import { env } from "../../environment/env";
import { logger } from "../../logger/logger";
import { loadApiKeyAccess } from "../../middleware/requireApiKeyAccess";
import Widget from "../../models/widget/widget.model";
import { UserModel } from "../../models/user/user.model";
import {
  assertLoginEmailNotLocked,
  recordLoginEmailFailure,
  resetLoginEmailFailures,
} from "../../rateLimit/loginEmailFailures";
import { otpRateConfig } from "../../rateLimit/rateLimit.config";
import { parseApiKeyId } from "../../validation/apiKey";
import { signAccessToken } from "../../utils/jwt";
import { encodeResetToken } from "../../utils/resetToken";
import {
  signVisitorJwt,
  visitorJwtAudience,
} from "../../utils/visitorJwt";
import { appConfigService } from "../appConfig/AppConfig.service";
import { mailer } from "../mail/mail.service";
import { OtpService } from "../otp/otp.service";
import { PLAN_NEVER_UNTIL } from "../../models/userPlanPeriod/userPlanPeriod.interface";
import { UserPlanPeriodModel } from "../../models/userPlanPeriod/userPlanPeriod.model";
import { addCalendarMonths } from "../../utils/calendarMonth";
import { planService } from "../plan/plan.service";
import { userPlanPeriodService } from "../userPlanPeriod/userPlanPeriod.service";

export type SendOtpResult = {
  email: string;
  cooldownSeconds: number;
};

export class AuthService {
  private readonly source = "auth/auth.service.ts";

  async sendOtp(input: SendOtpInDto): Promise<SendOtpResult> {
    const email = input.email;
    const isResetPassword = input.isResetPassword ?? false;
    const purpose = isResetPassword ? "reset-password" : "register";
    const otpService = new OtpService();
    const method = "sendOtp";

    const user = await UserModel.findOne({ email });

    if (isResetPassword) {
      // Enumeration-safe: always return the same success shape.
      if (!user) {
        return {
          email,
          cooldownSeconds: otpRateConfig.cooldownSeconds,
        };
      }

      const issued = await otpService.issueOtp(email, purpose);
      const token = encodeResetToken(email, issued.otp);
      const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;
      const sent = await mailer.sendResetPasswordLink(email, resetUrl);

      if (!sent) {
        logger.error(
          `Failed to send reset password email to ${email}`,
          this.source,
          method,
        );
        // Still return success-shaped response so absence cannot be probed via mail failures.
        return {
          email,
          cooldownSeconds: issued.cooldownSeconds,
        };
      }
      logger.debug(`Reset password link sent to ${email}`, this.source, method);
      return {
        email,
        cooldownSeconds: issued.cooldownSeconds,
      };
    }

    if (user) {
      throw new Error("Email already registered");
    }

    const issued = await otpService.issueOtp(email, purpose);
    const sent = await mailer.sendOtp(email, issued.otp);
    if (!sent) {
      logger.error(`Failed to send OTP email to ${email}`, this.source, method);
      throw new Error("Failed to send OTP");
    }

    logger.debug(`OTP sent successfully to ${email}`, this.source, method);
    return {
      email,
      cooldownSeconds: issued.cooldownSeconds,
    };
  }

  async register(input: registerInDto): Promise<RegisterOutDto> {
    const email = input.email;
    const otp = input.otp;
    const password = input.password;
    const method = "register";
    const userExist = await UserModel.findOne({ email });

    if (userExist) {
      throw new Error("Email already registered");
    }

    if (!appConfigService.openRegister && !appConfigService.firstRegister) {
      throw new Error("Registration is closed, please contact admin");
    }

    const otpService = new OtpService();
    const ok = await otpService.validateAndConsume(email, "register", otp);
    if (!ok) {
      throw new Error(otpRateConfig.messages.invalid);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const isAdmin = appConfigService.firstRegister;

    try {
      const now = new Date();
      const defaultPlanId = await planService.getDefaultPlan();
      let user;
      if (isAdmin) {
        user = await UserModel.create({
          email,
          hashedPassword,
          isAdmin: true,
          planId: defaultPlanId,
          planPeriodUntil: PLAN_NEVER_UNTIL,
          planVersion: 0,
        });
      } else {
        const until = addCalendarMonths(now, 1);
        user = await UserModel.create({
          email,
          hashedPassword,
          isAdmin: false,
          planId: defaultPlanId,
          planPeriodUntil: until,
          planVersion: 0,
        });
        const snap =
          await userPlanPeriodService.snapshotQuotaFromPlan(defaultPlanId);
        await UserPlanPeriodModel.create({
          userId: user._id,
          planId: defaultPlanId,
          effectiveDate: now,
          untilDate: until,
          source: "default_sync",
          createdBy: null,
          deepseekQuotaPerPeriod: snap.deepseekQuotaPerPeriod,
          quotaWindowDays: snap.quotaWindowDays,
          deepseekTokenAdjustments: [],
        });
      }

      if (isAdmin) {
        appConfigService.markAdminRegistered();
      }

      const token = signAccessToken({
        userId: user.id,
        email: user.email!,
        isAdmin: user.isAdmin!,
        rememberMe: false,
      });

      logger.debug(`User registered: ${email}`, this.source, method);

      void mailer.sendWelcome(email).catch((error) => {
        logger.error(
          error instanceof Error ? error.message : String(error),
          this.source,
          method,
        );
      });

      return {
        email,
        jwt: token,
      };
    } catch (error) {
      logger.error(
        error instanceof Error ? error.message : String(error),
        this.source,
        method,
      );
      throw error;
    }
  }

  async login(input: LoginInDto): Promise<LoginOutDto> {
    const email = input.email;
    const password = input.password;
    const rememberMe = input.rememberMe ?? false;
    const method = "login";

    if (!appConfigService.openLogin) {
      throw new Error("Login is closed, please contact admin");
    }

    await assertLoginEmailNotLocked(email);

    const user = await UserModel.findOne({ email });
    if (!user) {
      await recordLoginEmailFailure(email);
      throw new Error("Invalid email or password");
    }

    const match = await bcrypt.compare(password, user.hashedPassword!);
    if (!match) {
      await recordLoginEmailFailure(email);
      throw new Error("Invalid email or password");
    }

    await resetLoginEmailFailures(email);

    const token = signAccessToken({
      userId: user.id,
      email: user.email!,
      isAdmin: user.isAdmin!,
      rememberMe,
    });

    logger.debug(`User logged in: ${email}`, this.source, method);

    return {
      email: user.email!,
      jwt: token,
    };
  }

  async resetPassword(input: ResetPasswordInDto): Promise<ResetPasswordOutDto> {
    const email = input.email;
    const otp = input.otp;
    const password = input.password;
    const method = "resetPassword";

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new Error("No account found with this email");
    }

    const otpService = new OtpService();
    const ok = await otpService.validateAndConsume(
      email,
      "reset-password",
      otp,
    );
    if (!ok) {
      throw new Error(otpRateConfig.messages.invalid);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await UserModel.updateOne({ email }, { hashedPassword });
    logger.debug(`Password reset for ${email}`, this.source, method);

    return { email };
  }

  /**
   * Issue a short-lived visitor JWT for the signed-in user to pass into a
   * widget embed (`postMessage` type `sapai:visitor-token`).
   *
   * When `claims.apiKeyId` is present, the user must own or collaborate on that
   * project, and `publicKey` must be that project's widget key.
   * Admins may mint without `apiKeyId` (Train / dev testing).
   */
  async createVisitorJwt(
    userId: Types.ObjectId,
    email: string,
    input: CreateVisitorJwtInDto,
    options?: { isAdmin?: boolean },
  ): Promise<CreateVisitorJwtOutDto> {
    const method = "createVisitorJwt";
    const publicKey = input.publicKey?.trim() ?? "";
    if (!publicKey) {
      throw new Error("Widget public key is required");
    }

    if (!env.visitorJwtPrivateKeyPem) {
      throw new Error(
        "Visitor JWT signing is not configured (VISITOR_JWT_PRIVATE_KEY_PEM)",
      );
    }

    const issuer = env.visitorJwtIssuer || env.frontendUrl;
    if (!issuer) {
      throw new Error("Visitor JWT issuer is not configured");
    }

    const rawApiKeyId = input.claims?.apiKeyId;
    const apiKeyIdClaim =
      typeof rawApiKeyId === "string" ? rawApiKeyId.trim() : "";

    if (apiKeyIdClaim) {
      const apiKeyId = parseApiKeyId(apiKeyIdClaim);
      await loadApiKeyAccess(userId, apiKeyId);

      const widget = await Widget.findOne({ apiKeyId })
        .select("publicKey")
        .lean<{ publicKey?: string } | null>();
      if (!widget?.publicKey?.trim()) {
        throw new Error("Widget not found for this project");
      }
      if (widget.publicKey.trim() !== publicKey) {
        throw new Error(
          "Widget public key does not match the project in claims.apiKeyId",
        );
      }
    } else if (!options?.isAdmin) {
      throw new Error(
        "claims.apiKeyId is required (open a project, or pass apiKeyId)",
      );
    }

    // Host-style mint: accessMode is enforced on verify/bind, not here.
    const signed = signVisitorJwt({
      privateKeyPem: env.visitorJwtPrivateKeyPem,
      algorithm: "RS256",
      issuer,
      audience: visitorJwtAudience(publicKey),
      sub: userId.toString(),
      claims: {
        email,
        ...(input.claims ?? {}),
      },
      expiresInSeconds: input.expiresInSeconds,
    });

    logger.debug(
      `Visitor JWT issued for user ${email} widget ${publicKey}`,
      this.source,
      method,
    );

    return {
      token: signed.token,
      expiresAt: signed.expiresAt.toISOString(),
      audience: signed.audience,
      issuer: signed.issuer,
    };
  }
}

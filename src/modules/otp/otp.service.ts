import { logger } from "../../logger/logger";
import type { OtpPurpose } from "../../models/otp/opt.interface";
import { OtpModel } from "../../models/otp/otp.model";
import { otpRateConfig } from "../../rateLimit/rateLimit.config";
import { HttpError } from "../../utils/httpError";

export class OtpService {
  otp: string;

  constructor() {
    this.otp = this.generateOtp();
  }

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Issue a new OTP code for email+purpose. Enforces cooldown and hourly cap.
   * Never deletes the document — only updates code + rate fields.
   */
  async issueOtp(email: string, purpose: OtpPurpose): Promise<{
    otp: string;
    cooldownSeconds: number;
  }> {
    const now = Date.now();
    const nowDate = new Date(now);
    const existing = await OtpModel.findOne({ email, purpose }).lean();

    if (existing?.lastSentAt) {
      const elapsed = now - new Date(existing.lastSentAt).getTime();
      if (elapsed < otpRateConfig.cooldownMs) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((otpRateConfig.cooldownMs - elapsed) / 1000),
        );
        throw new HttpError(
          otpRateConfig.messages.cooldown,
          429,
          retryAfterSeconds,
        );
      }
    }

    let sendCount = existing?.sendCount ?? 0;
    let sendWindowStart = existing?.sendWindowStart
      ? new Date(existing.sendWindowStart)
      : null;

    if (
      !sendWindowStart ||
      now - sendWindowStart.getTime() >= otpRateConfig.sendWindowMs
    ) {
      sendCount = 0;
      sendWindowStart = nowDate;
    }

    if (sendCount >= otpRateConfig.sendMaxPerWindow) {
      const windowEnd = sendWindowStart.getTime() + otpRateConfig.sendWindowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowEnd - now) / 1000),
      );
      throw new HttpError(
        otpRateConfig.messages.sendCap,
        429,
        retryAfterSeconds,
      );
    }

    sendCount += 1;
    this.otp = this.generateOtp();
    const otpExpiresAt = new Date(now + otpRateConfig.codeTtlMs);
    const sendWindowEnd = new Date(
      sendWindowStart.getTime() + otpRateConfig.sendWindowMs,
    );
    const expiresAt = new Date(
      Math.max(otpExpiresAt.getTime(), sendWindowEnd.getTime()),
    );

    await OtpModel.findOneAndUpdate(
      { email, purpose },
      {
        $set: {
          email,
          purpose,
          otp: this.otp,
          otpExpiresAt,
          lastSentAt: nowDate,
          sendCount,
          sendWindowStart,
          failedAttempts: 0,
          expiresAt,
        },
        $setOnInsert: {
          createdAt: nowDate,
        },
      },
      { upsert: true, new: true },
    );

    return {
      otp: this.otp,
      cooldownSeconds: otpRateConfig.cooldownSeconds,
    };
  }

  /**
   * Validate OTP and clear code fields only (rate fields survive).
   * Wrong attempts are incremented atomically; after max, code is cleared.
   */
  async validateAndConsume(
    email: string,
    purpose: OtpPurpose,
    otp: string,
  ): Promise<boolean> {
    const now = new Date();

    const consumed = await OtpModel.findOneAndUpdate(
      {
        email,
        purpose,
        otp,
        otpExpiresAt: { $gt: now },
      },
      {
        $set: { otp: null, otpExpiresAt: null, failedAttempts: 0 },
      },
      { new: true },
    );

    if (consumed) {
      return true;
    }

    const failed = await OtpModel.findOneAndUpdate(
      {
        email,
        purpose,
        otp: { $type: "string", $ne: "" },
        otpExpiresAt: { $gt: now },
      },
      { $inc: { failedAttempts: 1 } },
      { new: true },
    );

    if (!failed) {
      logger.error(
        `Invalid or expired OTP for ${email} (${purpose})`,
        "otp/otp.service.ts",
        "validateAndConsume",
      );
      return false;
    }

    if ((failed.failedAttempts ?? 0) >= otpRateConfig.maxFailedAttempts) {
      await OtpModel.updateOne(
        { _id: failed._id },
        { $set: { otp: null, otpExpiresAt: null } },
      );
      throw new HttpError(otpRateConfig.messages.invalidated, 400);
    }

    logger.error(
      `Invalid or expired OTP for ${email} (${purpose})`,
      "otp/otp.service.ts",
      "validateAndConsume",
    );
    return false;
  }
}

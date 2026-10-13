import { Types } from "mongoose";

export type OtpPurpose = "register" | "reset-password";

export interface Otpinterface {
  otp?: string | null;
  otpExpiresAt?: Date | null;
  userId?: Types.ObjectId;
  email: string;
  purpose: OtpPurpose;
  lastSentAt?: Date | null;
  sendCount?: number;
  sendWindowStart?: Date | null;
  failedAttempts?: number;
  createdAt?: Date;
  expiresAt: Date;
}

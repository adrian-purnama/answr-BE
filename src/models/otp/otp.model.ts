import { model, Schema, Types } from "mongoose";
import { Otpinterface } from "./opt.interface";

const otpSchema = new Schema<Otpinterface>({
  otp: {
    type: String,
    default: null,
  },
  otpExpiresAt: {
    type: Date,
    default: null,
  },
  userId: {
    type: Types.ObjectId,
    ref: "User",
  },
  email: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ["register", "reset-password"],
    required: true,
  },
  lastSentAt: {
    type: Date,
    default: null,
  },
  sendCount: {
    type: Number,
    default: 0,
  },
  sendWindowStart: {
    type: Date,
    default: null,
  },
  failedAttempts: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = model<Otpinterface>("Otp", otpSchema);

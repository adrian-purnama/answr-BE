import { model, Schema, Types } from "mongoose";
import { UserInterface } from "./user.interface";

const userSchema = new Schema<UserInterface>({
  email: {
    type: String,
    required: true,
  },
  hashedPassword: {
    type: String,
    required: true,
  },
  isAdmin: {
    type: Boolean,
    required: true,
    default: false,
  },
  isBlocked: {
    type: Boolean,
    required: true,
    default: false,
  },
  planId: {
    type: Types.ObjectId,
    ref: "Plan",
    required: false,
  },
  planPeriodUntil: {
    type: Date,
    required: false,
    default: null,
  },
  /** Legacy   unset by migrateUserPlanPeriods. */
  planExpiresAt: {
    type: Date,
    required: false,
    default: null,
  },
  planVersion: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
});

userSchema.index({ planPeriodUntil: 1 });

export const UserModel = model<UserInterface>("User", userSchema);

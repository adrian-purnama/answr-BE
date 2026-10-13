import { model, Schema } from "mongoose";
import type { WidgetVisitCooldownInterface } from "./widgetVisitCooldown.interface";

const widgetVisitCooldownSchema = new Schema<WidgetVisitCooldownInterface>({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  expireAt: {
    type: Date,
    required: true,
  },
});

widgetVisitCooldownSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const WidgetVisitCooldownModel = model<WidgetVisitCooldownInterface>(
  "WidgetVisitCooldown",
  widgetVisitCooldownSchema,
);

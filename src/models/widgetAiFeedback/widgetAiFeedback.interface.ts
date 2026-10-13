import type { Types } from "mongoose";

export const WIDGET_AI_FEEDBACK_TRIGGERS = ["resolved", "session_end"] as const;

export type WidgetAiFeedbackTrigger =
  (typeof WIDGET_AI_FEEDBACK_TRIGGERS)[number];

export interface WidgetAiFeedbackInterface {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  publicKey: string;
  chatSessionId: Types.ObjectId;
  stars: number;
  feedback: string;
  trigger: WidgetAiFeedbackTrigger;
  createdAt: Date;
  updatedAt: Date;
}

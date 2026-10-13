import type { Types } from "mongoose";

export interface WidgetVisitCooldownInterface {
  _id: Types.ObjectId;
  key: string;
  expireAt: Date;
}

import type { Types } from "mongoose";

export type NewsCta = {
  enabled: boolean;
  text: string;
  url: string;
};

export interface NewsInterface {
  userId: Types.ObjectId;
  apiKeyId: Types.ObjectId;
  title: string;
  heroImage: string;
  content: string;
  cta: NewsCta;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

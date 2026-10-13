import * as bcrypt from "bcrypt";
import { Types } from "mongoose";
import { ApiKeyModel } from "../models/apiKey/apiKey.model";
import { assertApiKeyActive, ApiKeyInactiveError } from "../utils/apiKeyStatus";
import { AuthError } from "./authenticate";

export interface ApiKeyAuthContext {
  apiKeyId: Types.ObjectId;
  userId: Types.ObjectId;
}

export async function authenticateByApiKey(
  rawKey: string,
): Promise<ApiKeyAuthContext> {
  if (!rawKey.trim()) {
    throw new AuthError("Missing or invalid authorization token");
  }

  const dotIndex = rawKey.indexOf(".");
  if (dotIndex <= 0 || dotIndex === rawKey.length - 1) {
    throw new AuthError("Missing or invalid authorization token");
  }

  const prefix = rawKey.slice(0, dotIndex);
  const apiKey = await ApiKeyModel.findOne({ prefix });

  if (!apiKey) {
    throw new AuthError("Invalid API key");
  }

  const matches = await bcrypt.compare(rawKey, apiKey.hashedKey);
  if (!matches) {
    throw new AuthError("Invalid API key");
  }

  try {
    assertApiKeyActive(apiKey.status.status);
  } catch (error) {
    if (error instanceof ApiKeyInactiveError) {
      throw new AuthError(error.message, error.statusCode);
    }
    throw error;
  }

  await ApiKeyModel.findByIdAndUpdate(apiKey._id, {
    $set: { lastUsedAt: new Date() },
  });

  return {
    apiKeyId: apiKey._id,
    userId: apiKey.userId,
  };
}

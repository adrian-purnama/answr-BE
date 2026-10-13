import crypto from "crypto";
import { env } from "../environment/env";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const HMAC_PREFIX = "v1";

function macFor(publicKey: string, objectId: string): string {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(`${HMAC_PREFIX}:${publicKey}:${objectId}`)
    .digest("base64url");
}

export function signPublicSessionId(
  publicKey: string,
  objectId: string,
): string {
  return `${objectId}.${macFor(publicKey, objectId)}`;
}

/** Returns the canonical Mongo session id, or throws "Chat session not found". */
export function verifyPublicSessionId(
  publicKey: string,
  token: string,
): string {
  const trimmed = token.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    throw new Error("Chat session not found");
  }
  const objectId = trimmed.slice(0, dot);
  const providedMac = trimmed.slice(dot + 1);
  if (!OBJECT_ID_RE.test(objectId)) {
    throw new Error("Chat session not found");
  }

  const expectedMac = macFor(publicKey.trim(), objectId);
  const provided = Buffer.from(providedMac);
  const expected = Buffer.from(expectedMac);
  if (provided.length !== expected.length) {
    throw new Error("Chat session not found");
  }
  if (!crypto.timingSafeEqual(provided, expected)) {
    throw new Error("Chat session not found");
  }
  return objectId;
}

export function tryVerifyPublicSessionId(
  publicKey: string,
  token: string,
): string | null {
  try {
    return verifyPublicSessionId(publicKey, token);
  } catch {
    return null;
  }
}

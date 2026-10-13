import jwt from "jsonwebtoken";
import type { VisitorJwtAlgorithm } from "../models/widget/widget.interface";

const MAX_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const MAX_CLAIMS_JSON_BYTES = 4096;

export type VerifiedVisitorIdentity = {
  sub: string;
  iss: string;
  claims: Record<string, unknown>;
  tokenExp: Date;
};

export type SignVisitorJwtInput = {
  privateKeyPem: string;
  algorithm?: VisitorJwtAlgorithm;
  issuer: string;
  audience: string;
  sub: string;
  claims?: Record<string, unknown>;
  /** Lifetime in seconds (max 24h). Defaults to 1 hour. */
  expiresInSeconds?: number;
};

export type SignedVisitorJwt = {
  token: string;
  expiresAt: Date;
  audience: string;
  issuer: string;
};

export function visitorJwtAudience(publicKey: string): string {
  return `sapai:widget:${publicKey}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeClaims(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (!isPlainObject(raw)) {
    throw new Error("claims must be an object");
  }
  const json = JSON.stringify(raw);
  if (json.length > MAX_CLAIMS_JSON_BYTES) {
    throw new Error("claims payload is too large");
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Mint a short-lived visitor JWT for a widget embed (host → widget).
 * Register the matching public key + issuer on the widget configuration.
 */
export function signVisitorJwt(input: SignVisitorJwtInput): SignedVisitorJwt {
  const privateKeyPem = input.privateKeyPem.trim();
  if (!privateKeyPem) {
    throw new Error("Visitor JWT private key is not configured");
  }

  const issuer = input.issuer.trim();
  if (!issuer) {
    throw new Error("Visitor JWT issuer is not configured");
  }

  const audience = input.audience.trim();
  if (!audience) {
    throw new Error("Visitor JWT audience is required");
  }

  const sub = input.sub.trim();
  if (!sub) {
    throw new Error("Visitor JWT sub is required");
  }

  const expiresInSeconds = Math.min(
    Math.max(1, input.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS),
    MAX_TOKEN_TTL_MS / 1000,
  );
  const algorithm: VisitorJwtAlgorithm = input.algorithm ?? "RS256";
  const claims = sanitizeClaims(input.claims);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + expiresInSeconds;

  const token = jwt.sign(
    {
      sub,
      iss: issuer,
      aud: audience,
      iat: nowSeconds,
      exp,
      ...(Object.keys(claims).length > 0 ? { claims } : {}),
    },
    privateKeyPem,
    { algorithm },
  );

  return {
    token,
    expiresAt: new Date(exp * 1000),
    audience,
    issuer,
  };
}

export function verifyVisitorJwt(
  token: string,
  options: {
    publicKeyPem: string;
    algorithm: VisitorJwtAlgorithm;
    issuer: string;
    audience: string;
  },
): VerifiedVisitorIdentity {
  const pem = options.publicKeyPem.trim();
  if (!pem) {
    throw new Error("Visitor authentication is not configured for this widget");
  }
  const issuer = options.issuer.trim();
  if (!issuer) {
    throw new Error("Visitor JWT issuer is not configured for this widget");
  }

  let decoded: jwt.JwtPayload;
  try {
    const result = jwt.verify(token, pem, {
      algorithms: [options.algorithm],
      audience: options.audience,
      issuer,
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
    if (typeof result === "string" || !result || typeof result !== "object") {
      throw new Error("Invalid visitor token");
    }
    decoded = result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Visitor")) {
      throw error;
    }
    throw new Error("Invalid or expired visitor token");
  }

  const sub = typeof decoded.sub === "string" ? decoded.sub.trim() : "";
  if (!sub) {
    throw new Error("Visitor token missing sub");
  }

  if (typeof decoded.exp !== "number" || typeof decoded.iat !== "number") {
    throw new Error("Visitor token missing iat/exp");
  }

  const expMs = decoded.exp * 1000;
  const iatMs = decoded.iat * 1000;
  if (expMs - iatMs > MAX_TOKEN_TTL_MS) {
    throw new Error("Visitor token lifetime exceeds 24 hours");
  }

  const iss = typeof decoded.iss === "string" ? decoded.iss : issuer;
  const claims = sanitizeClaims(decoded.claims);

  return {
    sub,
    iss,
    claims,
    tokenExp: new Date(expMs),
  };
}

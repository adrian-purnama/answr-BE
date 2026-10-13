export type CreateVisitorJwtInDto = {
  /** Widget public key   becomes the JWT `aud` (`sapai:widget:<publicKey>`). */
  publicKey: string;
  /** Optional flat claims object embedded under `claims`. */
  claims?: Record<string, unknown>;
  /** Lifetime in seconds (1s–24h). Defaults to 1 hour. */
  expiresInSeconds?: number;
};

export type CreateVisitorJwtOutDto = {
  token: string;
  expiresAt: string;
  audience: string;
  issuer: string;
};

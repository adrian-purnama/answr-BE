function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * BUILD must be exactly "development" | "production".
 * Fail fast   never silently default to production (or development).
 */
export function parseBuild(raw: string | undefined): "development" | "production" {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      'BUILD is required and must be exactly "development" or "production"',
    );
  }
  const value = stripQuotes(raw);
  if (value === "development" || value === "production") {
    return value;
  }
  throw new Error(
    `BUILD must be exactly "development" or "production", got "${value}"`,
  );
}

import type { UpdateAdminUserDto } from "../dto/adminUser.dto";

const MIN_PASSWORD_LENGTH = 8;

export function parseEmailSearchQuery(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

function parsePositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value) && typeof value[0] === "string"
        ? value[0]
        : "";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseUserListQuery(query: unknown): {
  email: string;
  page: number;
  pageSize: number;
} {
  const q =
    query && typeof query === "object"
      ? (query as Record<string, unknown>)
      : {};
  return {
    email: parseEmailSearchQuery(q.email),
    page: parsePositiveInt(q.page, 1, 1, 1_000_000),
    pageSize: parsePositiveInt(q.pageSize, 20, 1, 100),
  };
}

export function parseUpdateAdminUserDto(body: unknown): UpdateAdminUserDto {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const raw = body as Record<string, unknown>;
  const patch: UpdateAdminUserDto = {};

  if ("password" in raw) {
    if (typeof raw.password !== "string" || !raw.password) {
      throw new Error("password must be a non-empty string");
    }
    if (raw.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    patch.password = raw.password;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No valid fields to update");
  }

  return patch;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

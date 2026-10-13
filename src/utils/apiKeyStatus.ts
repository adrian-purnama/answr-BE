export class ApiKeyInactiveError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export function assertApiKeyActive(
  status: "active" | "disabled_plan" | "revoked" | string,
): void {
  switch (status) {
    case "active":
      return;
    case "revoked":
      throw new ApiKeyInactiveError("API key is revoked");
    case "disabled_plan":
      throw new ApiKeyInactiveError("API key is disabled", 403);
    default:
      throw new ApiKeyInactiveError("API key is not active");
  }
}

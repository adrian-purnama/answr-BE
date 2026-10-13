/** Service/controller error with an HTTP status (and optional Retry-After). */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

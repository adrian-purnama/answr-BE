export interface ApiResponseDto<T = null> {
    success: boolean;
    message: string;
    data: T;
    /** Present on 429 responses for client countdowns. */
    retryAfterSeconds?: number;
  }
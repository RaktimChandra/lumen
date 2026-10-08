import type { ApiErrorCode, ApiFieldError } from '@lumen/shared';

/** An error that maps directly to an HTTP response. Anything else becomes a 500. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiFieldError[];
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { details?: ApiFieldError[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers;
  }
}

export const errors = {
  validation: (message: string, details: ApiFieldError[] = []) =>
    new AppError(400, 'VALIDATION_ERROR', message, { details }),
  badRequest: (message: string) => new AppError(400, 'BAD_REQUEST', message),
  unauthorized: (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHORIZED', message),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Your access token has expired.'),
  sessionExpired: (message = 'Your session has ended. Please sign in again.') =>
    new AppError(401, 'SESSION_EXPIRED', message),
  invalidCredentials: () =>
    new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'),
  /**
   * Resources owned by someone else are reported as missing, never as forbidden,
   * so ids of other users' data cannot be confirmed by probing.
   */
  notFound: (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} not found.`),
  conflict: (message: string, details?: ApiFieldError[]) =>
    new AppError(409, 'CONFLICT', message, { details }),
};

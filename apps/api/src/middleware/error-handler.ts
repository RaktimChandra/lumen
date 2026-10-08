import type { ApiErrorBody, ApiFieldError } from '@lumen/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { PG, pgErrorCode } from '../lib/sql';

function zodDetails(error: ZodError): ApiFieldError[] {
  return error.issues.flatMap((issue): ApiFieldError[] => {
    const base = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: base ? `${base}.${key}` : key,
        message: `Unknown field "${key}" is not allowed`,
      }));
    }
    return [{ path: base, message: issue.message }];
  });
}

/** Map an unknown error to a safe HTTP response. Internal details are logged, never returned. */
function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    const details = zodDetails(error);
    const first = details[0];
    const message = details.length === 1 && first ? first.message : 'Some fields are invalid.';
    return new AppError(400, 'VALIDATION_ERROR', message, { details });
  }

  const bodyParserType = (error as { type?: string } | null)?.type;
  if (bodyParserType === 'entity.parse.failed') {
    return new AppError(400, 'BAD_REQUEST', 'Request body must be valid JSON.');
  }
  if (bodyParserType === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (bodyParserType === 'encoding.unsupported' || bodyParserType === 'charset.unsupported') {
    return new AppError(415, 'BAD_REQUEST', 'Unsupported request encoding.');
  }

  switch (pgErrorCode(error)) {
    case PG.UNIQUE_VIOLATION:
      return new AppError(409, 'CONFLICT', 'That record already exists.');
    case PG.CHECK_VIOLATION:
      return new AppError(400, 'VALIDATION_ERROR', 'The values provided are not allowed together.');
    case PG.FOREIGN_KEY_VIOLATION:
      return new AppError(404, 'NOT_FOUND', 'A related record was not found.');
    case PG.INVALID_TEXT_REPRESENTATION:
      return new AppError(400, 'BAD_REQUEST', 'A value in the request has the wrong format.');
    default:
      return null;
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = String(req.id ?? '');
    const appError = toAppError(error);

    if (!appError) {
      (req.log ?? logger).error({ err: error, requestId }, 'unhandled error');
      const body: ApiErrorBody = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on our side. Try again in a moment.',
          requestId,
        },
      };
      res.status(500).json(body);
      return;
    }

    if (appError.status >= 500) {
      (req.log ?? logger).error({ err: error, requestId }, appError.message);
    }
    for (const [name, value] of Object.entries(appError.headers ?? {})) res.setHeader(name, value);

    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details?.length ? { details: appError.details } : {}),
        requestId,
      },
    };
    res.status(appError.status).json(body);
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.path}.`,
      requestId: String(req.id ?? ''),
    },
  };
  res.status(404).json(body);
};

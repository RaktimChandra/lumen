import type { ApiErrorBody } from '@lumen/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { AppConfig } from '../config/env';

function limitedHandler(message: string): Options['handler'] {
  return (req, res, _next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    const body: ApiErrorBody = {
      error: { code: 'RATE_LIMITED', message, requestId: String(req.id ?? '') },
    };
    if (!res.getHeader('Retry-After')) res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(options.statusCode).json(body);
  };
}

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

export interface RateLimiters {
  /** Register + login per IP. Slows credential stuffing and sign-up spam. */
  auth: RequestHandler;
  /** Failed logins per email, independent of IP, so rotating IPs does not help an attacker. */
  loginPerEmail: RequestHandler;
  /** Token refresh per IP. */
  refresh: RequestHandler;
  /** Generous ceiling for the whole API. */
  api: RequestHandler;
}

export function createRateLimiters(config: AppConfig['rateLimit']): RateLimiters {
  const common = { standardHeaders: 'draft-8', legacyHeaders: false } as const;

  return {
    auth: rateLimit({
      ...common,
      windowMs: config.authWindowMs,
      limit: config.authMax,
      keyGenerator: (req) => `auth:${clientIp(req)}`,
      handler: limitedHandler('Too many sign-in attempts from this network. Try again later.'),
    }),
    loginPerEmail: rateLimit({
      ...common,
      windowMs: config.authWindowMs,
      limit: config.loginFailuresPerEmail,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        const email =
          typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return `login-email:${email.slice(0, 254)}`;
      },
      handler: limitedHandler(
        'Too many failed sign-in attempts for this account. Wait a few minutes and try again.',
      ),
    }),
    refresh: rateLimit({
      ...common,
      windowMs: 15 * 60_000,
      limit: 120,
      keyGenerator: (req) => `refresh:${clientIp(req)}`,
      handler: limitedHandler('Too many session refreshes. Try again later.'),
    }),
    api: rateLimit({
      ...common,
      windowMs: 60_000,
      limit: config.apiPerMinute,
      keyGenerator: (req) => `api:${clientIp(req)}`,
      handler: limitedHandler('Too many requests. Slow down and try again shortly.'),
    }),
  };
}

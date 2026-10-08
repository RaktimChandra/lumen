import type { Request } from 'express';
import type { z } from 'zod';

export type ClientPlatform = 'web' | 'mobile' | 'unknown';

export function clientPlatform(req: Request): ClientPlatform {
  const header = req.get('x-client-platform')?.toLowerCase();
  if (header === 'mobile') return 'mobile';
  if (header === 'web') return 'web';
  return 'unknown';
}

export interface RequestContext {
  userId: string;
  platform: ClientPlatform;
  ip: string | null;
}

export function requestContext(req: Request): RequestContext {
  if (!req.auth) throw new Error('requestContext() used on an unauthenticated route');
  return { userId: req.auth.userId, platform: clientPlatform(req), ip: req.ip ?? null };
}

/** Parse untrusted input with a zod schema; ZodErrors are turned into 400s by the error handler. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  return schema.parse(input ?? {});
}

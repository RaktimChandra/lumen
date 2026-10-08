import { and, eq, gt, isNull } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { AppContext } from '../context';
import { sessions } from '../db/schema';
import { errors } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

/**
 * Requires `Authorization: Bearer <access token>`.
 *
 * Besides checking the JWT signature and expiry, it confirms the session named in the
 * token is still active. That makes logout and "sign out this device" take effect
 * immediately instead of waiting for the access token to expire.
 */
export function authenticate(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match?.[1]) throw errors.unauthorized('Sign in to continue.');

    const claims = verifyAccessToken(match[1], ctx.config.auth.accessSecret);

    const [session] = await ctx.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, claims.sessionId),
          eq(sessions.userId, claims.userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session) throw errors.sessionExpired();

    req.auth = { userId: claims.userId, sessionId: claims.sessionId };
    next();
  };
}

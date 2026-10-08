import {
  idParamSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
} from '@lumen/shared';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import type { AppContext } from '../../context';
import { errors } from '../../lib/errors';
import { clientPlatform, parse } from '../../lib/request';
import { readAccessTokenAllowExpired } from '../../lib/tokens';
import { authenticate } from '../../middleware/authenticate';
import type { RateLimiters } from '../../middleware/rate-limit';
import { createAuthService, type ClientMeta, type IssuedSession } from './auth.service';

export const REFRESH_COOKIE = 'lumen_rt';

export function authRoutes(ctx: AppContext, limiters: RateLimiters): Router {
  const router = Router();
  const auth = createAuthService(ctx);
  const requireAuth = authenticate(ctx);

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: ctx.config.cookies.secure,
    sameSite: ctx.config.cookies.sameSite,
    path: '/api/auth',
    maxAge: ctx.config.auth.refreshTtlDays * 86_400_000,
  };

  const meta = (req: Request): ClientMeta => ({
    platform: clientPlatform(req),
    userAgent: req.get('user-agent') ?? null,
    ip: req.ip ?? null,
  });

  /**
   * Browsers get the refresh token as an httpOnly cookie (unreadable by scripts).
   * The mobile app has no cookie jar it controls, so it receives the token in the
   * body and keeps it in the Android Keystore via expo-secure-store.
   */
  function sendSession(req: Request, res: Response, issued: IssuedSession, status = 200) {
    const isMobile = clientPlatform(req) === 'mobile';
    if (!isMobile && issued.refreshToken)
      res.cookie(REFRESH_COOKIE, issued.refreshToken, cookieOptions);
    const body: AuthResponse = {
      user: issued.user,
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      ...(isMobile && issued.refreshToken ? { refreshToken: issued.refreshToken } : {}),
    };
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(body);
  }

  const clearRefreshCookie = (res: Response) => {
    const { maxAge: _maxAge, ...rest } = cookieOptions;
    res.clearCookie(REFRESH_COOKIE, rest);
  };

  router.post('/register', limiters.auth, async (req, res) => {
    const input = parse(registerSchema, req.body);
    sendSession(req, res, await auth.register(input, meta(req)), 201);
  });

  router.post('/login', limiters.auth, limiters.loginPerEmail, async (req, res) => {
    const input = parse(loginSchema, req.body);
    sendSession(req, res, await auth.login(input, meta(req)));
  });

  router.post('/refresh', limiters.refresh, async (req, res) => {
    const body = parse(refreshSchema, req.body);
    const token = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) throw errors.sessionExpired('No active session. Please sign in.');
    try {
      sendSession(req, res, await auth.refresh(token, meta(req)));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  });

  /**
   * Revokes the current session server-side. Works with an expired access token or
   * with only the refresh token, so a client can always sign out cleanly. Idempotent.
   */
  router.post('/logout', async (req, res) => {
    const body = parse(refreshSchema, req.body);
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const claims = bearer
      ? readAccessTokenAllowExpired(bearer, ctx.config.auth.accessSecret)
      : null;
    const refreshToken = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);

    await auth.logout(
      claims ? { sessionId: claims.sessionId, userId: claims.userId } : { refreshToken },
      meta(req),
    );
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: await auth.me(req.auth!.userId) });
  });

  router.get('/sessions', requireAuth, async (req, res) => {
    res.json({ data: await auth.listSessions(req.auth!.userId, req.auth!.sessionId) });
  });

  router.delete('/sessions/:id', requireAuth, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    await auth.revokeSession(req.auth!.userId, id, meta(req));
    res.status(204).end();
  });

  return router;
}

import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { errors } from './errors';

const ISSUER = 'lumen-api';
const AUDIENCE = 'lumen-clients';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Short-lived JWT carrying the user id (`sub`) and the session id (`sid`). */
export function signAccessToken(claims: AccessClaims, secret: string, ttlSeconds: number): string {
  return jwt.sign({ sid: claims.sessionId }, secret, {
    algorithm: 'HS256',
    subject: claims.userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: ttlSeconds,
  });
}

export function verifyAccessToken(token: string, secret: string): AccessClaims {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw errors.unauthorized('Invalid access token.');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw errors.tokenExpired();
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
      throw errors.unauthorized('Invalid access token.');
    }
    throw error;
  }
}

/** 256-bit opaque refresh token. Only its SHA-256 is persisted. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Read a signed access token even if it has expired (used only to identify the session at logout). */
export function readAccessTokenAllowExpired(token: string, secret: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      ignoreExpiration: true,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      return null;
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

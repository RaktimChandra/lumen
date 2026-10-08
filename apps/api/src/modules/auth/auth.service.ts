import type { LoginInput, Session, User } from '@lumen/shared';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbExecutor } from '../../db/client';
import { sessions, users, type UserRow } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { ClientPlatform } from '../../lib/request';
import { PG, pgErrorCode } from '../../lib/sql';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens';
import { recordAudit } from '../activity/audit.service';

/** A rotated refresh token presented again within this window is treated as a benign race. */
const ROTATION_GRACE_MS = 30_000;

export interface ClientMeta {
  platform: ClientPlatform;
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  user: User;
  sessionId: string;
  accessToken: string;
  expiresIn: number;
  /** Undefined when the refresh happened inside the rotation grace window. */
  refreshToken?: string;
}

export interface RegisterData {
  fullName: string;
  email: string;
  password: string;
}

export function toUser(row: Pick<UserRow, 'id' | 'fullName' | 'email' | 'createdAt'>): User {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

const userColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  createdAt: users.createdAt,
};

export function createAuthService(ctx: AppContext) {
  const { db, config, passwords } = ctx;
  const refreshTtlMs = config.auth.refreshTtlDays * 86_400_000;

  function accessTokenFor(userId: string, sessionId: string): string {
    return signAccessToken(
      { userId, sessionId },
      config.auth.accessSecret,
      config.auth.accessTtlSeconds,
    );
  }

  async function openSession(tx: DbExecutor, user: User, meta: ClientMeta): Promise<IssuedSession> {
    const refreshToken = generateRefreshToken();
    const [session] = await tx
      .insert(sessions)
      .values({
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        platform: meta.platform,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ipAddress: meta.ip,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error('Failed to create session');

    return {
      user,
      sessionId: session.id,
      accessToken: accessTokenFor(user.id, session.id),
      expiresIn: config.auth.accessTtlSeconds,
      refreshToken,
    };
  }

  const emailTaken = () =>
    errors.conflict('An account with this email already exists.', [
      { path: 'email', message: 'An account with this email already exists.' },
    ]);

  async function register(data: RegisterData, meta: ClientMeta): Promise<IssuedSession> {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    if (existing) throw emailTaken();

    const passwordHash = await passwords.hash(data.password);
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({ fullName: data.fullName, email: data.email, passwordHash })
          .returning(userColumns);
        if (!row) throw new Error('Failed to create user');
        const user = toUser(row);
        const issued = await openSession(tx, user, meta);
        await recordAudit(tx, {
          userId: user.id,
          action: 'auth.register',
          entityType: 'user',
          entityId: user.id,
          summary: 'Created the account',
          platform: meta.platform,
          ip: meta.ip,
        });
        return issued;
      });
    } catch (error) {
      // Two sign-ups racing for the same email: the unique index decides.
      if (pgErrorCode(error) === PG.UNIQUE_VIOLATION) throw emailTaken();
      throw error;
    }
  }

  async function login(input: Required<LoginInput>, meta: ClientMeta): Promise<IssuedSession> {
    const [row] = await db
      .select({ ...userColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    const valid = await passwords.verify(input.password, row?.passwordHash ?? null);
    if (!row || !valid) throw errors.invalidCredentials();

    const user = toUser(row);
    return db.transaction(async (tx) => {
      const issued = await openSession(tx, user, meta);
      await recordAudit(tx, {
        userId: user.id,
        action: 'auth.login',
        entityType: 'session',
        entityId: issued.sessionId,
        summary: `Signed in on ${meta.platform === 'mobile' ? 'the mobile app' : meta.platform === 'web' ? 'the web app' : 'a new device'}`,
        platform: meta.platform,
        ip: meta.ip,
      });
      return issued;
    });
  }

  /**
   * Exchange a refresh token for a new access token, rotating the refresh token.
   * Replaying an already-rotated token outside the grace window revokes the whole
   * session, since it means the token was copied.
   */
  async function refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedSession> {
    const presentedHash = hashToken(refreshToken);
    const now = new Date();
    const nextToken = generateRefreshToken();

    // Atomic compare-and-swap: only one concurrent caller can rotate a given token.
    const [rotated] = await db
      .update(sessions)
      .set({
        refreshTokenHash: hashToken(nextToken),
        previousTokenHash: presentedHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + refreshTtlMs),
        ipAddress: meta.ip,
      })
      .where(
        and(
          eq(sessions.refreshTokenHash, presentedHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .returning({ id: sessions.id, userId: sessions.userId });

    if (rotated) {
      const user = await findUser(rotated.userId);
      return {
        user,
        sessionId: rotated.id,
        accessToken: accessTokenFor(user.id, rotated.id),
        expiresIn: config.auth.accessTtlSeconds,
        refreshToken: nextToken,
      };
    }

    const [previous] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.previousTokenHash, presentedHash))
      .limit(1);

    if (!previous || previous.revokedAt || previous.expiresAt <= now) throw errors.sessionExpired();

    const withinGrace =
      previous.rotatedAt !== null &&
      now.getTime() - previous.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (withinGrace) {
      // Two tabs refreshed at once; the other one already holds the new token.
      const user = await findUser(previous.userId);
      return {
        user,
        sessionId: previous.id,
        accessToken: accessTokenFor(user.id, previous.id),
        expiresIn: config.auth.accessTtlSeconds,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: now, revokedReason: 'refresh_reuse' })
        .where(eq(sessions.id, previous.id));
      await recordAudit(tx, {
        userId: previous.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'session',
        entityId: previous.id,
        summary: 'Signed out a device after an old sign-in token was reused',
        platform: meta.platform,
        ip: meta.ip,
      });
    });
    throw errors.sessionExpired(
      'For your security this session was signed out. Please sign in again.',
    );
  }

  async function findUser(userId: string): Promise<User> {
    const [row] = await db.select(userColumns).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw errors.sessionExpired();
    return toUser(row);
  }

  /** Revoke the session identified by an access token's session id or by a refresh token. */
  async function logout(
    target: { sessionId?: string; userId?: string; refreshToken?: string },
    meta: ClientMeta,
  ): Promise<void> {
    const now = new Date();
    let condition;
    if (target.sessionId && target.userId) {
      condition = and(eq(sessions.id, target.sessionId), eq(sessions.userId, target.userId));
    } else if (target.refreshToken) {
      condition = eq(sessions.refreshTokenHash, hashToken(target.refreshToken));
    } else {
      return;
    }

    await db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(sessions)
        .set({ revokedAt: now, revokedReason: 'logout' })
        .where(and(condition, isNull(sessions.revokedAt)))
        .returning({ id: sessions.id, userId: sessions.userId });
      if (revoked) {
        await recordAudit(tx, {
          userId: revoked.userId,
          action: 'auth.logout',
          entityType: 'session',
          entityId: revoked.id,
          summary: 'Signed out',
          platform: meta.platform,
          ip: meta.ip,
        });
      }
    });
  }

  async function listSessions(userId: string, currentSessionId: string): Promise<Session[]> {
    const rows = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.lastUsedAt))
      .limit(50);
    return rows.map((row) => ({
      id: row.id,
      platform: (['web', 'mobile'].includes(row.platform)
        ? row.platform
        : 'unknown') as Session['platform'],
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  async function revokeSession(userId: string, sessionId: string, meta: ClientMeta): Promise<void> {
    await db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'revoked_by_user' })
        .where(
          and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)),
        )
        .returning({ id: sessions.id, platform: sessions.platform });
      if (!revoked) throw errors.notFound('Session');
      await recordAudit(tx, {
        userId,
        action: 'auth.session_revoked',
        entityType: 'session',
        entityId: revoked.id,
        summary:
          `Signed out a ${revoked.platform === 'mobile' ? 'mobile' : revoked.platform === 'web' ? 'web' : ''} session`.replace(
            '  ',
            ' ',
          ),
        platform: meta.platform,
        ip: meta.ip,
      });
    });
  }

  /** Housekeeping: drop sessions that expired or were revoked more than a week ago. */
  async function pruneSessions(): Promise<number> {
    const result = await db.execute(
      sql`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`,
    );
    return result.rowCount ?? 0;
  }

  return {
    register,
    login,
    refresh,
    logout,
    me: findUser,
    listSessions,
    revokeSession,
    pruneSessions,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

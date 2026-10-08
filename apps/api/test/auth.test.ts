import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sessions, users } from '../src/db/schema';
import { hashToken } from '../src/lib/tokens';
import {
  containsKey,
  createUser,
  makeApp,
  PASSWORD,
  TEST_SECRET,
  testDb,
  uniqueEmail,
} from './helpers';

const app = makeApp();

describe('POST /api/auth/register', () => {
  it('creates an account, hashes the password and never returns the hash', async () => {
    const email = uniqueEmail('Ada');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Ada Lovelace', email: `  ${email.toUpperCase()} `, password: PASSWORD })
      .expect(201);

    expect(res.body.user).toMatchObject({ fullName: 'Ada Lovelace', email: email.toLowerCase() });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toBe(900);
    expect(containsKey(res.body, 'passwordHash')).toBe(false);
    expect(containsKey(res.body, 'password')).toBe(false);

    const [row] = await testDb()
      .db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    expect(row!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row!.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email regardless of case', async () => {
    const email = uniqueEmail('dup');
    await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'First', email, password: PASSWORD })
      .expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Second', email: email.toUpperCase(), password: PASSWORD })
      .expect(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT' });
    expect(res.body.error.details).toEqual([
      { path: 'email', message: 'An account with this email already exists.' },
    ]);
  });

  it('validates every field and reports them together', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: ' ', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
  });

  it('rejects missing body and wrong types', async () => {
    await request(app).post('/api/auth/register').expect(400);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 42, email: ['a'], password: true })
      .expect(400);
    expect(res.body.error.details).toHaveLength(3);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password, case-insensitive email', async () => {
    const user = await createUser(app, 'login');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email.toUpperCase(), password: PASSWORD })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await createUser(app, 'wrongpw');
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'nope12345' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'nope12345' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('gives browsers an httpOnly refresh cookie and no token in the body', async () => {
    const user = await createUser(app, 'webcookie');
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Platform', 'web')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/lumen_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('gives the mobile app the refresh token in the body and sets no cookie', async () => {
    const user = await createUser(app, 'mobile');
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Platform', 'mobile')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('GET /api/auth/me and token checks', () => {
  it('returns the current user for a valid token', async () => {
    const user = await createUser(app, 'me');
    const res = await request(app).get('/api/auth/me').set(user.auth).expect(200);
    expect(res.body.user).toEqual({
      id: user.id,
      fullName: 'Test me',
      email: user.email,
      createdAt: expect.any(String),
    });
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['garbage token', 'Bearer not.a.jwt'],
  ])('rejects %s with 401 UNAUTHORIZED', async (_label, header) => {
    const req = request(app).get('/api/auth/me');
    if (header) req.set('Authorization', header);
    const res = await req.expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token signed with another secret', async () => {
    const user = await createUser(app, 'forged');
    const forged = jwt.sign({ sid: 'x' }, 'another-secret-that-is-long-enough-xyz', {
      subject: user.id,
      issuer: 'lumen-api',
      audience: 'lumen-clients',
    });
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects the "none" algorithm', async () => {
    const user = await createUser(app, 'none');
    const unsigned = jwt.sign({ sid: 'x', sub: user.id }, '', { algorithm: 'none' });
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
  });

  it('reports an expired token as TOKEN_EXPIRED so clients know to refresh', async () => {
    const user = await createUser(app, 'expired');
    const decoded = jwt.decode(user.token) as { sid: string };
    const expired = jwt.sign(
      { sid: decoded.sid, exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_SECRET,
      { subject: user.id, issuer: 'lumen-api', audience: 'lumen-clients' },
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the mobile refresh token on each use', async () => {
    const user = await createUser(app, 'rotate');
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(user.refreshToken);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('tolerates a concurrent duplicate refresh within the grace window', async () => {
    const user = await createUser(app, 'grace');
    await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    const again = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(again.body.accessToken).toEqual(expect.any(String));
    expect(again.body.refreshToken).toBeUndefined();
  });

  it('signs the session out when a rotated token is replayed later', async () => {
    const user = await createUser(app, 'replay');
    const first = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken: user.refreshToken })
      .expect(200);

    // Pretend the rotation happened long ago.
    await testDb()
      .db.update(sessions)
      .set({ rotatedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(sessions.previousTokenHash, hashToken(user.refreshToken)));

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'mobile')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');

    // The legitimate holder of the newest token is signed out too.
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .expect(401);
  });

  it('refreshes a browser session from the cookie', async () => {
    const user = await createUser(app, 'webrefresh');
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .set('X-Client-Platform', 'web')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const res = await agent
      .post('/api/auth/refresh')
      .set('X-Client-Platform', 'web')
      .send({})
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(String(res.headers['set-cookie'])).toMatch(/lumen_rt=/);
  });

  it('fails cleanly without any token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({}).expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects an unknown refresh token', async () => {
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'made-up-token' })
      .expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session so the access token stops working immediately', async () => {
    const user = await createUser(app, 'logout');
    await request(app).post('/api/auth/logout').set(user.auth).expect(204);

    const me = await request(app).get('/api/auth/me').set(user.auth).expect(401);
    expect(me.body.error.code).toBe('SESSION_EXPIRED');
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('works with only the refresh token, and is idempotent', async () => {
    const user = await createUser(app, 'logout2');
    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: user.refreshToken })
      .expect(204);
    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: user.refreshToken })
      .expect(204);
    await request(app).get('/api/auth/me').set(user.auth).expect(401);
  });

  it('clears the browser cookie', async () => {
    const res = await request(app).post('/api/auth/logout').expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(/lumen_rt=;/);
  });
});

describe('sessions', () => {
  it('lists devices and signs out another one', async () => {
    const user = await createUser(app, 'devices');
    const web = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Platform', 'web')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);

    const list = await request(app).get('/api/auth/sessions').set(user.auth).expect(200);
    expect(list.body.data).toHaveLength(2);
    const other = list.body.data.find((s: { current: boolean }) => !s.current);
    expect(other.platform).toBe('web');

    await request(app).delete(`/api/auth/sessions/${other.id}`).set(user.auth).expect(204);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${web.body.accessToken}`)
      .expect(401);
    await request(app).get('/api/auth/me').set(user.auth).expect(200);
  });

  it("cannot sign out another user's session", async () => {
    const alice = await createUser(app, 'alice-s');
    const bob = await createUser(app, 'bob-s');
    const [aliceSession] = (await request(app).get('/api/auth/sessions').set(alice.auth)).body.data;
    await request(app).delete(`/api/auth/sessions/${aliceSession.id}`).set(bob.auth).expect(404);
    await request(app).get('/api/auth/me').set(alice.auth).expect(200);
  });
});

describe('rate limiting', () => {
  it('limits sign-in attempts per IP', async () => {
    const limited = makeApp({ authMax: 3 });
    for (let i = 0; i < 3; i += 1) {
      await request(limited)
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: 'x' })
        .expect(401);
    }
    const res = await request(limited)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'x' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers.ratelimit).toBeDefined();
  });

  it('limits failed attempts per account even across IPs', async () => {
    const limited = makeApp({ loginFailuresPerEmail: 2 });
    const user = await createUser(limited, 'brute');
    for (let i = 0; i < 2; i += 1) {
      await request(limited)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-123' })
        .expect(401);
    }
    await request(limited)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(429);
  });
});

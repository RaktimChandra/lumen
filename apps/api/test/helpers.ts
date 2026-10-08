import { randomUUID } from 'node:crypto';
import type { AuthResponse } from '@lumen/shared';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig, type AppConfig } from '../src/config/env';
import { createDatabase, type DatabaseHandle } from '../src/db/client';
import { createLogger } from '../src/lib/logger';
import { TEST_DATABASE_URL } from './env';

export const TEST_SECRET = 'test-secret-that-is-long-enough-0123456789';
export const PASSWORD = 'Sup3rSecretPass';

export function testConfig(overrides: Partial<AppConfig['rateLimit']> = {}): AppConfig {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_SSL: 'false',
    JWT_ACCESS_SECRET: TEST_SECRET,
    BCRYPT_ROUNDS: '4',
    CORS_ORIGINS: 'https://app.lumen.test',
    AUTH_RATE_LIMIT_MAX: '10000',
    LOGIN_FAILURES_PER_EMAIL: '10000',
    API_RATE_LIMIT_PER_MINUTE: '100000',
  });
  return { ...config, rateLimit: { ...config.rateLimit, ...overrides } };
}

let shared: DatabaseHandle | null = null;
/** One pool per test file, closed automatically. */
export function testDb(): DatabaseHandle {
  if (!shared) {
    shared = createDatabase(testConfig().database);
    afterAll(async () => {
      await shared?.close();
      shared = null;
    });
  }
  return shared;
}

export function makeApp(rateLimit: Partial<AppConfig['rateLimit']> = {}): Express {
  const config = testConfig(rateLimit);
  return createApp({ config, db: testDb().db, logger: createLogger(config) });
}

export const uniqueEmail = (label = 'user') => `${label}.${randomUUID().slice(0, 8)}@example.com`;

export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
  auth: { Authorization: string };
}

/** Registers a user through the API as the mobile client (so the refresh token is in the body). */
export async function createUser(app: Express, label = 'user'): Promise<TestUser> {
  const email = uniqueEmail(label);
  const res = await request(app)
    .post('/api/auth/register')
    .set('X-Client-Platform', 'mobile')
    .send({ fullName: `Test ${label}`, email, password: PASSWORD })
    .expect(201);
  const body = res.body as AuthResponse;
  return {
    id: body.user.id,
    email,
    token: body.accessToken,
    refreshToken: body.refreshToken!,
    auth: { Authorization: `Bearer ${body.accessToken}` },
  };
}

export async function createProject(
  app: Express,
  user: TestUser,
  body: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/projects')
    .set(user.auth)
    .send({ name: `Project ${randomUUID().slice(0, 6)}`, ...body })
    .expect(201);
  return res.body.data as { id: string; name: string } & Record<string, unknown>;
}

export async function createTask(
  app: Express,
  user: TestUser,
  projectId: string,
  body: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/tasks')
    .set(user.auth)
    .send({ projectId, name: `Task ${randomUUID().slice(0, 6)}`, ...body })
    .expect(201);
  return res.body.data as { id: string; name: string } & Record<string, unknown>;
}

/** Recursively search a JSON value for a key name. */
export function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key));
  }
  return false;
}

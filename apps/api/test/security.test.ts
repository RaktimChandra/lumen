import { sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  containsKey,
  createProject,
  createTask,
  createUser,
  makeApp,
  testDb,
  type TestUser,
} from './helpers';

const app = makeApp();

/**
 * Authorization: users can only see and change their own data, on every endpoint.
 * Bob tries to reach Alice's resources directly by id.
 */
describe('cross-user isolation', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceProject: { id: string; name: string };
  let aliceTask: { id: string; name: string };
  let bobProject: { id: string };
  let bobTask: { id: string };

  beforeAll(async () => {
    alice = await createUser(app, 'alice');
    bob = await createUser(app, 'bob');
    aliceProject = await createProject(app, alice, { name: 'Alice secret project' });
    aliceTask = await createTask(app, alice, aliceProject.id, { name: 'Alice secret task' });
    bobProject = await createProject(app, bob, { name: 'Bob project' });
    bobTask = await createTask(app, bob, bobProject.id);
  });

  it("hides Alice's projects from Bob's list and search", async () => {
    const list = await request(app).get('/api/projects?search=secret').set(bob.auth).expect(200);
    expect(list.body.meta.total).toBe(0);
    const tasks = await request(app).get('/api/tasks?search=secret').set(bob.auth).expect(200);
    expect(tasks.body.meta.total).toBe(0);
  });

  it("returns 404 (not 403) for Alice's project on read, update and delete", async () => {
    const url = `/api/projects/${aliceProject.id}`;
    for (const res of [
      await request(app).get(url).set(bob.auth),
      await request(app).put(url).set(bob.auth).send({ name: 'pwned' }),
      await request(app).patch(url).set(bob.auth).send({ name: 'pwned' }),
      await request(app).delete(url).set(bob.auth),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const still = await request(app).get(url).set(alice.auth).expect(200);
    expect(still.body.data.name).toBe('Alice secret project');
  });

  it("returns 404 for Alice's task on read, update and delete", async () => {
    const url = `/api/tasks/${aliceTask.id}`;
    await request(app).get(url).set(bob.auth).expect(404);
    await request(app).put(url).set(bob.auth).send({ status: 'COMPLETED' }).expect(404);
    await request(app).delete(url).set(bob.auth).expect(404);
    const still = await request(app).get(url).set(alice.auth).expect(200);
    expect(still.body.data).toMatchObject({ name: 'Alice secret task', status: 'PENDING' });
  });

  it("cannot add a task to Alice's project", async () => {
    await request(app)
      .post('/api/tasks')
      .set(bob.auth)
      .send({ projectId: aliceProject.id, name: 'intrude' })
      .expect(404);
    const res = await request(app)
      .get(`/api/tasks?projectId=${aliceProject.id}`)
      .set(alice.auth)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
  });

  it("cannot move his own task into Alice's project", async () => {
    await request(app)
      .put(`/api/tasks/${bobTask.id}`)
      .set(bob.auth)
      .send({ projectId: aliceProject.id })
      .expect(404);
    const res = await request(app).get(`/api/tasks/${bobTask.id}`).set(bob.auth).expect(200);
    expect(res.body.data.projectId).toBe(bobProject.id);
  });

  it("cannot read Alice's tasks by filtering on her project id", async () => {
    const res = await request(app)
      .get(`/api/tasks?projectId=${aliceProject.id}`)
      .set(bob.auth)
      .expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('dashboard and activity only count my own data', async () => {
    const dash = await request(app).get('/api/dashboard').set(bob.auth).expect(200);
    expect(dash.body.data).toMatchObject({ totalProjects: 1, totalTasks: 1 });
    const activity = await request(app).get('/api/activity').set(bob.auth).expect(200);
    expect(JSON.stringify(activity.body)).not.toContain('Alice');
  });

  it('requires authentication on every data endpoint', async () => {
    const endpoints: [string, string][] = [
      ['get', '/api/projects'],
      ['post', '/api/projects'],
      ['get', `/api/projects/${aliceProject.id}`],
      ['put', `/api/projects/${aliceProject.id}`],
      ['delete', `/api/projects/${aliceProject.id}`],
      ['get', '/api/tasks'],
      ['post', '/api/tasks'],
      ['get', `/api/tasks/${aliceTask.id}`],
      ['put', `/api/tasks/${aliceTask.id}`],
      ['delete', `/api/tasks/${aliceTask.id}`],
      ['get', '/api/dashboard'],
      ['get', '/api/activity'],
      ['get', '/api/auth/me'],
      ['get', '/api/auth/sessions'],
    ];
    for (const [method, url] of endpoints) {
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[
        method
      ]!(url);
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(401);
    }
  });
});

describe('injection and input handling', () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createUser(app, 'inject');
    await createProject(app, user, { name: "O'Brien's lab" });
  });

  it('treats SQL in search as plain text', async () => {
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "\\' OR 1=1 --",
      "x%' UNION SELECT password_hash FROM users --",
    ];
    for (const search of payloads) {
      const res = await request(app)
        .get('/api/projects')
        .query({ search })
        .set(user.auth)
        .expect(200);
      expect(res.body.meta.total).toBe(0);
    }
    const quote = await request(app)
      .get('/api/projects')
      .query({ search: "O'Brien" })
      .set(user.auth)
      .expect(200);
    expect(quote.body.meta.total).toBe(1);
    const tables = await testDb().db.execute(sql`SELECT to_regclass('public.users') AS t`);
    expect(tables.rows[0]).toEqual({ t: 'users' });
  });

  it('stores and returns markup as inert text', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(user.auth)
      .send({ name: '<img src=x onerror=alert(1)>' })
      .expect(201);
    expect(res.body.data.name).toBe('<img src=x onerror=alert(1)>');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('rejects malformed JSON with a clear 400', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(user.auth)
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(res.body.error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Request body must be valid JSON.',
    });
  });

  it('rejects oversized bodies', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(user.auth)
      .send({ name: 'Big', description: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects prototype pollution keys', async () => {
    await request(app)
      .post('/api/projects')
      .set(user.auth)
      .set('Content-Type', 'application/json')
      .send('{"name":"x","__proto__":{"admin":true}}')
      .expect(400);
  });
});

describe('response hygiene', () => {
  it('never exposes password hashes or refresh token hashes', async () => {
    const user = await createUser(app, 'hygiene');
    const project = await createProject(app, user);
    await createTask(app, user, project.id);
    const responses = await Promise.all([
      request(app).get('/api/auth/me').set(user.auth),
      request(app).get('/api/auth/sessions').set(user.auth),
      request(app).get('/api/projects').set(user.auth),
      request(app).get('/api/tasks').set(user.auth),
      request(app).get('/api/dashboard').set(user.auth),
      request(app).get('/api/activity').set(user.auth),
    ]);
    for (const [index, res] of responses.entries()) {
      expect(res.status).toBe(200);
      for (const key of [
        'passwordHash',
        'password_hash',
        'password',
        'refreshTokenHash',
        'ownerId',
        'ipAddress',
      ]) {
        expect(containsKey(res.body, key), `response #${index} leaks ${key}`).toBe(false);
      }
    }
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('includes a request id in error bodies for support', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('X-Request-Id', 'trace-12345678')
      .expect(401);
    expect(res.body.error.requestId).toBe('trace-12345678');
    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });
});

describe('CORS', () => {
  it('allows the configured web origin with credentials', async () => {
    const res = await request(app)
      .options('/api/projects')
      .set('Origin', 'https://app.lumen.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.lumen.test');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('docs', () => {
  it('serves a valid OpenAPI document covering every required endpoint', async () => {
    const res = await request(app).get('/api/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.0.3');
    for (const path of [
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/projects',
      '/api/projects/{id}',
      '/api/tasks',
      '/api/tasks/{id}',
      '/api/dashboard',
    ]) {
      expect(res.body.paths[path], path).toBeDefined();
    }
  });
});

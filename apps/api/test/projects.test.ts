import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProject, createTask, createUser, makeApp, type TestUser } from './helpers';

const app = makeApp();
let user: TestUser;

beforeAll(async () => {
  user = await createUser(app, 'projects');
});

describe('project CRUD', () => {
  it('creates with defaults and returns Location', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(user.auth)
      .send({ name: '  Spectrometer  ' })
      .expect(201);
    expect(res.headers.location).toBe(`/api/projects/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      name: 'Spectrometer',
      description: '',
      status: 'NOT_STARTED',
      startDate: null,
      endDate: null,
      taskStats: { total: 0, progress: 0 },
    });
  });

  it('reads, updates and deletes', async () => {
    const project = await createProject(app, user, {
      name: 'Laser bench',
      description: 'v1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    const read = await request(app).get(`/api/projects/${project.id}`).set(user.auth).expect(200);
    expect(read.body.data).toMatchObject({
      name: 'Laser bench',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    const updated = await request(app)
      .put(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    // Partial update keeps untouched fields.
    expect(updated.body.data).toMatchObject({
      name: 'Laser bench',
      description: 'v1',
      status: 'IN_PROGRESS',
    });

    await request(app).delete(`/api/projects/${project.id}`).set(user.auth).expect(204);
    await request(app).get(`/api/projects/${project.id}`).set(user.auth).expect(404);
  });

  it('accepts PATCH as an alias of PUT', async () => {
    const project = await createProject(app, user);
    await request(app)
      .patch(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ name: 'Patched' })
      .expect(200);
  });

  it('deleting a project deletes its tasks', async () => {
    const project = await createProject(app, user);
    const task = await createTask(app, user, project.id);
    await request(app).delete(`/api/projects/${project.id}`).set(user.auth).expect(204);
    await request(app).get(`/api/tasks/${task.id}`).set(user.auth).expect(404);
  });

  it('clears dates with null', async () => {
    const project = await createProject(app, user, { startDate: '2026-01-01' });
    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ startDate: null })
      .expect(200);
    expect(res.body.data.startDate).toBeNull();
  });
});

describe('project validation', () => {
  it.each([
    [{}, 'name', 'Project name is required'],
    [{ name: '   ' }, 'name', 'Project name cannot be empty'],
    [{ name: 'x'.repeat(121) }, 'name', 'Project name must be at most 120 characters'],
    [
      { name: 'X', status: 'Done' },
      'status',
      'Status must be one of: NOT_STARTED, IN_PROGRESS, COMPLETED',
    ],
    [
      { name: 'X', startDate: '2026-02-30' },
      'startDate',
      'Start date is not a valid calendar date',
    ],
    [
      { name: 'X', startDate: '08/10/2026' },
      'startDate',
      'Start date must be a date in YYYY-MM-DD format',
    ],
    [
      { name: 'X', startDate: '2026-10-10', endDate: '2026-10-01' },
      'endDate',
      'End date cannot be before the start date',
    ],
    [
      { name: 'X', ownerId: '00000000-0000-0000-0000-000000000000' },
      'ownerId',
      'Unknown field "ownerId" is not allowed',
    ],
    [{ name: 'X', description: 5 }, 'description', 'Description must be text'],
  ])('rejects %j', async (body, path, message) => {
    const res = await request(app).post('/api/projects').set(user.auth).send(body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ path, message });
  });

  it('checks the date range against stored values on partial update', async () => {
    const project = await createProject(app, user, { startDate: '2026-10-10' });
    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ endDate: '2026-10-01' })
      .expect(400);
    expect(res.body.error.details).toContainEqual({
      path: 'endDate',
      message: 'End date cannot be before the start date',
    });
  });

  it('rejects an empty update', async () => {
    const project = await createProject(app, user);
    await request(app).put(`/api/projects/${project.id}`).set(user.auth).send({}).expect(400);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    await request(app).get('/api/projects/not-a-uuid').set(user.auth).expect(400);
    const res = await request(app)
      .get('/api/projects/7f1c2a54-6a55-4d3f-9a0d-2a6f1c0b8e11')
      .set(user.auth)
      .expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Project not found.' });
  });
});

describe('listing, search, filters and paging', () => {
  let lister: TestUser;

  beforeAll(async () => {
    lister = await createUser(app, 'lister');
    await createProject(app, lister, { name: 'Alpha optics', status: 'IN_PROGRESS' });
    await createProject(app, lister, { name: 'beta OPTICS', status: 'COMPLETED' });
    await createProject(app, lister, { name: 'Gamma firmware', status: 'IN_PROGRESS' });
    await createProject(app, lister, { name: '100% coverage_plan', status: 'NOT_STARTED' });
  });

  it('lists only my projects with paging metadata', async () => {
    const res = await request(app).get('/api/projects').set(lister.auth).expect(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
    expect(res.body.data).toHaveLength(4);
  });

  it('searches by name case-insensitively', async () => {
    const res = await request(app).get('/api/projects?search=optics').set(lister.auth).expect(200);
    expect(res.body.data.map((p: { name: string }) => p.name).sort()).toEqual([
      'Alpha optics',
      'beta OPTICS',
    ]);
  });

  it('treats % and _ in search literally', async () => {
    const percent = await request(app).get('/api/projects?search=%25').set(lister.auth).expect(200);
    expect(percent.body.data.map((p: { name: string }) => p.name)).toEqual(['100% coverage_plan']);
    const underscore = await request(app)
      .get('/api/projects?search=_')
      .set(lister.auth)
      .expect(200);
    expect(underscore.body.meta.total).toBe(1);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/projects?status=IN_PROGRESS')
      .set(lister.auth)
      .expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((p: { status: string }) => p.status === 'IN_PROGRESS')).toBe(true);
  });

  it('sorts and pages', async () => {
    const page1 = await request(app)
      .get('/api/projects?sort=name&order=asc&limit=2')
      .set(lister.auth)
      .expect(200);
    const page2 = await request(app)
      .get('/api/projects?sort=name&order=asc&limit=2&page=2')
      .set(lister.auth)
      .expect(200);
    expect(page1.body.meta).toMatchObject({ total: 4, totalPages: 2 });
    const names = [...page1.body.data, ...page2.body.data].map((p: { name: string }) => p.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    );
    expect(new Set(names).size).toBe(4);
  });

  it.each([
    'status=DONE',
    'sort=password',
    'limit=0',
    'limit=101',
    'page=-1',
    'order=up',
    'status=A&status=B',
    'evil=1',
  ])('rejects bad query %s', async (qs) => {
    const res = await request(app).get(`/api/projects?${qs}`).set(lister.auth).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('progress statistics', () => {
  it('reports task counts and progress per project', async () => {
    const project = await createProject(app, user);
    await createTask(app, user, project.id, { status: 'COMPLETED' });
    await createTask(app, user, project.id, { status: 'IN_PROGRESS' });
    await createTask(app, user, project.id, { status: 'PENDING', dueDate: '2020-01-01' });
    await createTask(app, user, project.id, { status: 'COMPLETED', dueDate: '2020-01-01' });

    const res = await request(app).get(`/api/projects/${project.id}`).set(user.auth).expect(200);
    expect(res.body.data.taskStats).toEqual({
      total: 4,
      completed: 2,
      inProgress: 1,
      pending: 1,
      overdue: 1,
      progress: 50,
    });
  });
});

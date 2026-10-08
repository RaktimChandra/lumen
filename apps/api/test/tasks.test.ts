import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProject, createTask, createUser, makeApp, type TestUser } from './helpers';

const app = makeApp();
let user: TestUser;
let projectId: string;

beforeAll(async () => {
  user = await createUser(app, 'tasks');
  projectId = (await createProject(app, user, { name: 'Imaging' })).id;
});

describe('task CRUD', () => {
  it('creates with defaults and includes the project name', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(user.auth)
      .send({ projectId, name: 'Calibrate detector' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      projectId,
      projectName: 'Imaging',
      name: 'Calibrate detector',
      description: '',
      priority: 'MEDIUM',
      status: 'PENDING',
      dueDate: null,
      completedAt: null,
      isOverdue: false,
    });
  });

  it('marks complete, records completedAt, and clears it when reopened', async () => {
    const task = await createTask(app, user, projectId);
    const done = await request(app)
      .put(`/api/tasks/${task.id}`)
      .set(user.auth)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(done.body.data.completedAt).toEqual(expect.any(String));

    const reopened = await request(app)
      .put(`/api/tasks/${task.id}`)
      .set(user.auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(reopened.body.data).toMatchObject({ status: 'IN_PROGRESS', completedAt: null });
  });

  it('creating a task as completed sets completedAt', async () => {
    const task = await createTask(app, user, projectId, { status: 'COMPLETED' });
    expect(task.completedAt).toEqual(expect.any(String));
  });

  it('changes priority without touching other fields', async () => {
    const task = await createTask(app, user, projectId, {
      name: 'Keep me',
      description: 'details',
      dueDate: '2026-12-01',
    });
    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .set(user.auth)
      .send({ priority: 'HIGH' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      name: 'Keep me',
      description: 'details',
      dueDate: '2026-12-01',
      priority: 'HIGH',
    });
  });

  it('moves a task to another of my projects', async () => {
    const other = await createProject(app, user, { name: 'Firmware' });
    const task = await createTask(app, user, projectId);
    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .set(user.auth)
      .send({ projectId: other.id })
      .expect(200);
    expect(res.body.data).toMatchObject({ projectId: other.id, projectName: 'Firmware' });
  });

  it('deletes', async () => {
    const task = await createTask(app, user, projectId);
    await request(app).delete(`/api/tasks/${task.id}`).set(user.auth).expect(204);
    await request(app).get(`/api/tasks/${task.id}`).set(user.auth).expect(404);
    await request(app).delete(`/api/tasks/${task.id}`).set(user.auth).expect(404);
  });
});

describe('task validation', () => {
  it.each([
    [{ name: 'X' }, 'projectId', 'Project is required'],
    [{ name: 'X', projectId: 'abc' }, 'projectId', 'Project must be a valid id'],
    [{ projectId: 'P', name: '' }, 'name', 'Task name cannot be empty'],
    [
      { projectId: 'P', name: 'X', priority: 'URGENT' },
      'priority',
      'Priority must be one of: LOW, MEDIUM, HIGH',
    ],
    [
      { projectId: 'P', name: 'X', status: 'DONE' },
      'status',
      'Status must be one of: PENDING, IN_PROGRESS, COMPLETED',
    ],
    [
      { projectId: 'P', name: 'X', dueDate: '2026-13-01' },
      'dueDate',
      'Due date is not a valid calendar date',
    ],
    [
      { projectId: 'P', name: 'X', completedAt: '2026-01-01' },
      'completedAt',
      'Unknown field "completedAt" is not allowed',
    ],
  ])('rejects %j', async (raw, path, message) => {
    const input = raw as Record<string, unknown>;
    const body = { ...input, ...(input.projectId === 'P' ? { projectId } : {}) };
    const res = await request(app).post('/api/tasks').set(user.auth).send(body).expect(400);
    expect(res.body.error.details).toContainEqual({ path, message });
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(user.auth)
      .send({ projectId: '7f1c2a54-6a55-4d3f-9a0d-2a6f1c0b8e11', name: 'Orphan' })
      .expect(404);
    expect(res.body.error.message).toBe('Project not found.');
  });
});

describe('search and filters', () => {
  let filterUser: TestUser;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    filterUser = await createUser(app, 'filters');
    p1 = (await createProject(app, filterUser, { name: 'One' })).id;
    p2 = (await createProject(app, filterUser, { name: 'Two' })).id;
    await createTask(app, filterUser, p1, {
      name: 'Align laser',
      priority: 'HIGH',
      status: 'PENDING',
      dueDate: '2026-10-01',
    });
    await createTask(app, filterUser, p1, {
      name: 'Laser safety review',
      priority: 'LOW',
      status: 'COMPLETED',
      dueDate: '2026-10-01',
    });
    await createTask(app, filterUser, p2, {
      name: 'Write firmware',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      dueDate: '2026-10-20',
    });
    await createTask(app, filterUser, p2, {
      name: 'Order lenses',
      priority: 'HIGH',
      status: 'PENDING',
    });
  });

  const list = async (qs: string) =>
    (await request(app).get(`/api/tasks?${qs}`).set(filterUser.auth).expect(200)).body;
  const names = (body: { data: { name: string }[] }) => body.data.map((t) => t.name).sort();

  it('lists all my tasks', async () => {
    expect((await list('')).meta.total).toBe(4);
  });

  it('searches by name', async () => {
    expect(names(await list('search=LASER'))).toEqual(['Align laser', 'Laser safety review']);
  });

  it('filters by status, priority and project, combined', async () => {
    expect(names(await list('status=PENDING'))).toEqual(['Align laser', 'Order lenses']);
    expect(names(await list('priority=HIGH'))).toEqual(['Align laser', 'Order lenses']);
    expect(names(await list(`projectId=${p2}`))).toEqual(['Order lenses', 'Write firmware']);
    expect(names(await list(`projectId=${p1}&priority=HIGH&status=PENDING`))).toEqual([
      'Align laser',
    ]);
  });

  it('filters overdue relative to the client date', async () => {
    expect(names(await list('overdue=true&today=2026-10-08'))).toEqual(['Align laser']);
    expect(names(await list('overdue=true&today=2026-09-01'))).toEqual([]);
    const all = await list('today=2026-10-08');
    expect(all.data.find((t: { name: string }) => t.name === 'Align laser').isOverdue).toBe(true);
    expect(all.data.find((t: { name: string }) => t.name === 'Laser safety review').isOverdue).toBe(
      false,
    );
  });

  it('sorts by priority and by due date with undated tasks last', async () => {
    const byPriority = await list('sort=priority&order=desc');
    expect(byPriority.data.map((t: { priority: string }) => t.priority)).toEqual([
      'HIGH',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]);
    const byDue = await list('sort=dueDate&order=asc');
    expect(byDue.data.at(-1).dueDate).toBeNull();
  });

  it('paginates', async () => {
    const page = await list('limit=3&page=2');
    expect(page.meta).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
    expect(page.data).toHaveLength(1);
  });

  it('rejects invalid filters', async () => {
    for (const qs of [
      'priority=urgent',
      'status=done',
      'projectId=1',
      'overdue=yes',
      'today=2026-02-31',
    ]) {
      await request(app).get(`/api/tasks?${qs}`).set(filterUser.auth).expect(400);
    }
  });
});

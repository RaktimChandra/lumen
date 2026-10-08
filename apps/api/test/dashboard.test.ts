import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProject, createTask, createUser, makeApp, type TestUser } from './helpers';

const app = makeApp();

describe('GET /api/dashboard', () => {
  it('is all zeros for a new account', async () => {
    const user = await createUser(app, 'empty');
    const res = await request(app).get('/api/dashboard').set(user.auth).expect(200);
    expect(res.body.data).toMatchObject({
      totalProjects: 0,
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      projectsInProgress: 0,
      completionRate: 0,
      upcomingTasks: [],
    });
  });

  describe('with data', () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await createUser(app, 'dash');
      const a = await createProject(app, user, { status: 'IN_PROGRESS' });
      const b = await createProject(app, user, { status: 'IN_PROGRESS' });
      await createProject(app, user, { status: 'COMPLETED' });
      await createProject(app, user, { status: 'NOT_STARTED' });

      await createTask(app, user, a.id, {
        status: 'COMPLETED',
        priority: 'HIGH',
        dueDate: '2026-10-01',
      });
      await createTask(app, user, a.id, {
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: '2026-10-05',
      }); // overdue
      await createTask(app, user, a.id, {
        status: 'IN_PROGRESS',
        priority: 'LOW',
        dueDate: '2026-10-10',
      }); // this week
      await createTask(app, user, b.id, {
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: '2026-10-14',
      }); // this week (+6)
      await createTask(app, user, b.id, {
        status: 'PENDING',
        priority: 'MEDIUM',
        dueDate: '2026-10-15',
      }); // next week
      await createTask(app, user, b.id, { status: 'COMPLETED', priority: 'LOW' });
    });

    it('returns the five required counters', async () => {
      const res = await request(app)
        .get('/api/dashboard?today=2026-10-08')
        .set(user.auth)
        .expect(200);
      expect(res.body.data).toMatchObject({
        totalProjects: 4,
        totalTasks: 6,
        completedTasks: 2,
        pendingTasks: 3,
        projectsInProgress: 2,
      });
    });

    it('returns breakdowns, overdue and due-this-week', async () => {
      const { data } = (await request(app).get('/api/dashboard?today=2026-10-08').set(user.auth))
        .body;
      expect(data).toMatchObject({
        openTasks: 4,
        inProgressTasks: 1,
        overdueTasks: 1,
        dueThisWeek: 2,
        completionRate: 33,
        projectsByStatus: { NOT_STARTED: 1, IN_PROGRESS: 2, COMPLETED: 1 },
        tasksByStatus: { PENDING: 3, IN_PROGRESS: 1, COMPLETED: 2 },
        tasksByPriority: { LOW: 2, MEDIUM: 2, HIGH: 2 },
      });
      expect(data.upcomingTasks.map((t: { dueDate: string }) => t.dueDate)).toEqual([
        '2026-10-05',
        '2026-10-10',
        '2026-10-14',
        '2026-10-15',
      ]);
      expect(data.upcomingTasks[0].isOverdue).toBe(true);
      expect(data.recentActivity.length).toBeGreaterThan(0);
    });

    it('updates as soon as a task changes', async () => {
      const before = (await request(app).get('/api/dashboard').set(user.auth)).body.data;
      const list = await request(app).get('/api/tasks?status=PENDING&limit=1').set(user.auth);
      await request(app)
        .put(`/api/tasks/${list.body.data[0].id}`)
        .set(user.auth)
        .send({ status: 'COMPLETED' })
        .expect(200);
      const after = (await request(app).get('/api/dashboard').set(user.auth)).body.data;
      expect(after.completedTasks).toBe(before.completedTasks + 1);
      expect(after.pendingTasks).toBe(before.pendingTasks - 1);
    });
  });
});

describe('GET /api/activity', () => {
  it('records actions with readable summaries and the client platform', async () => {
    const user = await createUser(app, 'activity');
    const project = await createProject(app, user, { name: 'Optics' });
    const task = await createTask(app, user, project.id, { name: 'Polish lens' });
    await request(app)
      .put(`/api/tasks/${task.id}`)
      .set(user.auth)
      .set('X-Client-Platform', 'mobile')
      .send({ status: 'COMPLETED' })
      .expect(200);

    const res = await request(app).get('/api/activity?limit=3').set(user.auth).expect(200);
    expect(res.body.data[0]).toMatchObject({
      action: 'task.complete',
      summary: 'Completed “Polish lens”',
      platform: 'mobile',
      entityId: task.id,
    });
    expect(res.body.data.map((a: { action: string }) => a.action)).toEqual([
      'task.complete',
      'task.create',
      'project.create',
    ]);
  });

  it('validates limit', async () => {
    const user = await createUser(app, 'activity2');
    await request(app).get('/api/activity?limit=1000').set(user.auth).expect(400);
  });
});

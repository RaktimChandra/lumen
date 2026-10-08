import type { Dashboard } from '@lumen/shared';
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { projects, tasks } from '../../db/schema';
import { listActivity } from '../activity/audit.service';
import { utcToday } from '../projects/projects.service';
import { taskSelection, toTask } from '../tasks/tasks.service';

interface CountsRow extends Record<string, unknown> {
  total_projects: number;
  projects_not_started: number;
  projects_in_progress: number;
  projects_completed: number;
  total_tasks: number;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_completed: number;
  priority_low: number;
  priority_medium: number;
  priority_high: number;
  overdue: number;
  due_this_week: number;
}

export function createDashboardService(db: Database) {
  async function get(userId: string, today = utcToday()): Promise<Dashboard> {
    // One round trip for every counter, using FILTER aggregates over the user's rows only.
    const countsQuery = db.execute<CountsRow>(sql`
      WITH p AS (
        SELECT id, status FROM projects WHERE owner_id = ${userId}
      ), t AS (
        SELECT t.status, t.priority, t.due_date
        FROM tasks t JOIN p ON p.id = t.project_id
      )
      SELECT
        (SELECT count(*) FROM p)                                            AS total_projects,
        (SELECT count(*) FROM p WHERE status = 'NOT_STARTED')               AS projects_not_started,
        (SELECT count(*) FROM p WHERE status = 'IN_PROGRESS')               AS projects_in_progress,
        (SELECT count(*) FROM p WHERE status = 'COMPLETED')                 AS projects_completed,
        count(*)                                                            AS total_tasks,
        count(*) FILTER (WHERE status = 'PENDING')                          AS tasks_pending,
        count(*) FILTER (WHERE status = 'IN_PROGRESS')                      AS tasks_in_progress,
        count(*) FILTER (WHERE status = 'COMPLETED')                        AS tasks_completed,
        count(*) FILTER (WHERE priority = 'LOW')                            AS priority_low,
        count(*) FILTER (WHERE priority = 'MEDIUM')                         AS priority_medium,
        count(*) FILTER (WHERE priority = 'HIGH')                           AS priority_high,
        count(*) FILTER (WHERE status <> 'COMPLETED' AND due_date < ${today}::date) AS overdue,
        count(*) FILTER (
          WHERE status <> 'COMPLETED'
            AND due_date BETWEEN ${today}::date AND ${today}::date + 6
        )                                                                   AS due_this_week
      FROM t
    `);

    // Open tasks with a due date, soonest (including overdue) first.
    const upcomingQuery = db
      .select(taskSelection(today))
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(eq(projects.ownerId, userId), ne(tasks.status, 'COMPLETED'), isNotNull(tasks.dueDate)),
      )
      .orderBy(asc(tasks.dueDate), sql`${tasks.priority} DESC`)
      .limit(6);

    const [countsResult, upcoming, recentActivity] = await Promise.all([
      countsQuery,
      upcomingQuery,
      listActivity(db, userId, 8),
    ]);
    const c = countsResult.rows[0] as CountsRow;
    const num = (value: unknown) => Number(value ?? 0);
    const totalTasks = num(c.total_tasks);
    const completedTasks = num(c.tasks_completed);

    return {
      totalProjects: num(c.total_projects),
      totalTasks,
      completedTasks,
      pendingTasks: num(c.tasks_pending),
      projectsInProgress: num(c.projects_in_progress),
      openTasks: totalTasks - completedTasks,
      inProgressTasks: num(c.tasks_in_progress),
      overdueTasks: num(c.overdue),
      dueThisWeek: num(c.due_this_week),
      completionRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
      projectsByStatus: {
        NOT_STARTED: num(c.projects_not_started),
        IN_PROGRESS: num(c.projects_in_progress),
        COMPLETED: num(c.projects_completed),
      },
      tasksByStatus: {
        PENDING: num(c.tasks_pending),
        IN_PROGRESS: num(c.tasks_in_progress),
        COMPLETED: completedTasks,
      },
      tasksByPriority: {
        LOW: num(c.priority_low),
        MEDIUM: num(c.priority_medium),
        HIGH: num(c.priority_high),
      },
      upcomingTasks: upcoming.map(toTask),
      recentActivity,
    };
  }

  return { get };
}

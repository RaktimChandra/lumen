import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type CreateTaskData,
  type Task,
  type TaskListQuery,
  type UpdateTaskData,
} from '@lumen/shared';
import { and, asc, count, desc, eq, ilike, inArray, not, sql, type SQL } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/client';
import { projects, tasks } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { RequestContext } from '../../lib/request';
import { containsPattern, pageMeta } from '../../lib/sql';
import { recordAudit } from '../activity/audit.service';
import { utcToday } from '../projects/projects.service';

const overdueExpr = (today: string) =>
  sql<boolean>`(${tasks.status} <> 'COMPLETED' AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${today}::date)`;

/** Columns returned for every task, joined with its project's name. */
export const taskSelection = (today: string) => ({
  id: tasks.id,
  projectId: tasks.projectId,
  projectName: projects.name,
  name: tasks.name,
  description: tasks.description,
  priority: tasks.priority,
  status: tasks.status,
  dueDate: tasks.dueDate,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  isOverdue: overdueExpr(today),
});

export interface TaskSelectRow {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isOverdue: boolean;
}

export function toTask(row: TaskSelectRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    name: row.name,
    description: row.description,
    priority: row.priority,
    status: row.status,
    dueDate: row.dueDate,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOverdue: Boolean(row.isOverdue),
  };
}

/** Project ids owned by the user, as a subquery. All task access goes through it. */
const ownedProjectIds = (db: DbExecutor, userId: string) =>
  db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));

const SORT_COLUMNS = {
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  name: tasks.name,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
} as const;

export function createTasksService(db: Database) {
  async function fetchOne(executor: DbExecutor, userId: string, id: string, today: string) {
    const [row] = await executor
      .select(taskSelection(today))
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, id), eq(projects.ownerId, userId)))
      .limit(1);
    return row ? toTask(row) : null;
  }

  async function findOwnedProject(executor: DbExecutor, userId: string, projectId: string) {
    const [project] = await executor
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);
    if (!project) {
      throw errors.notFound('Project');
    }
    return project;
  }

  async function list(userId: string, query: TaskListQuery) {
    const today = query.today ?? utcToday();
    const filters: SQL[] = [eq(projects.ownerId, userId)];
    if (query.projectId) filters.push(eq(tasks.projectId, query.projectId));
    if (query.search) filters.push(ilike(tasks.name, containsPattern(query.search)));
    if (query.status) filters.push(eq(tasks.status, query.status));
    if (query.priority) filters.push(eq(tasks.priority, query.priority));
    if (query.overdue === true) filters.push(overdueExpr(today));
    if (query.overdue === false) filters.push(not(overdueExpr(today)));
    const where = and(...filters);

    const column = SORT_COLUMNS[query.sort];
    const orderBy =
      query.sort === 'dueDate'
        ? sql`${column} ${sql.raw(query.order === 'asc' ? 'ASC' : 'DESC')} NULLS LAST`
        : (query.order === 'asc' ? asc : desc)(column);

    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select(taskSelection(today))
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(where)
        .orderBy(orderBy, desc(tasks.createdAt), desc(tasks.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db
        .select({ total: count() })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(where),
    ]);

    return { data: rows.map(toTask), meta: pageMeta(query.page, query.limit, total) };
  }

  async function get(userId: string, id: string, today = utcToday()): Promise<Task> {
    const task = await fetchOne(db, userId, id, today);
    if (!task) throw errors.notFound('Task');
    return task;
  }

  async function create(ctx: RequestContext, data: CreateTaskData): Promise<Task> {
    return db.transaction(async (tx) => {
      // The target project must belong to the caller; otherwise it "does not exist".
      const project = await findOwnedProject(tx, ctx.userId, data.projectId);
      const [row] = await tx
        .insert(tasks)
        .values({
          ...data,
          completedAt: data.status === 'COMPLETED' ? new Date() : null,
        })
        .returning({ id: tasks.id, name: tasks.name });
      if (!row) throw new Error('Failed to create task');

      await recordAudit(tx, {
        userId: ctx.userId,
        action: 'task.create',
        entityType: 'task',
        entityId: row.id,
        summary: `Added task “${row.name}” to “${project.name}”`,
        platform: ctx.platform,
        ip: ctx.ip,
      });
      const task = await fetchOne(tx, ctx.userId, row.id, utcToday());
      if (!task) throw new Error('Created task not readable');
      return task;
    });
  }

  async function update(ctx: RequestContext, id: string, data: UpdateTaskData): Promise<Task> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ task: tasks, projectName: projects.name })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(eq(tasks.id, id), eq(projects.ownerId, ctx.userId)))
        .for('update', { of: tasks })
        .limit(1);
      if (!existing) throw errors.notFound('Task');
      const before = existing.task;

      let movedToProject: string | null = null;
      if (data.projectId && data.projectId !== before.projectId) {
        movedToProject = (await findOwnedProject(tx, ctx.userId, data.projectId)).name;
      }

      const changes: Partial<typeof tasks.$inferInsert> = {};
      for (const [key, value] of Object.entries(data) as [keyof UpdateTaskData, unknown][]) {
        if (value !== undefined && before[key] !== value) {
          (changes as Record<string, unknown>)[key] = value;
        }
      }
      if (changes.status !== undefined) {
        changes.completedAt = changes.status === 'COMPLETED' ? new Date() : null;
      }

      if (Object.keys(changes).length > 0) {
        await tx
          .update(tasks)
          .set(changes)
          .where(and(eq(tasks.id, id), inArray(tasks.projectId, ownedProjectIds(tx, ctx.userId))));

        const completed = changes.status === 'COMPLETED';
        await recordAudit(tx, {
          userId: ctx.userId,
          action: completed ? 'task.complete' : 'task.update',
          entityType: 'task',
          entityId: id,
          summary: describeTaskChange(before.name, changes, movedToProject),
          platform: ctx.platform,
          ip: ctx.ip,
          metadata: {
            changes: Object.fromEntries(
              Object.keys(changes)
                .filter((key) => key !== 'completedAt')
                .map((key) => [
                  key,
                  {
                    from: before[key as keyof typeof before],
                    to: changes[key as keyof typeof changes],
                  },
                ]),
            ),
          },
        });
      }

      const task = await fetchOne(tx, ctx.userId, id, utcToday());
      if (!task) throw errors.notFound('Task');
      return task;
    });
  }

  async function remove(ctx: RequestContext, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(tasks)
        .where(and(eq(tasks.id, id), inArray(tasks.projectId, ownedProjectIds(tx, ctx.userId))))
        .returning({ id: tasks.id, name: tasks.name });
      if (!deleted) throw errors.notFound('Task');
      await recordAudit(tx, {
        userId: ctx.userId,
        action: 'task.delete',
        entityType: 'task',
        entityId: deleted.id,
        summary: `Deleted task “${deleted.name}”`,
        platform: ctx.platform,
        ip: ctx.ip,
      });
    });
  }

  return { list, get, create, update, remove };
}

function describeTaskChange(
  name: string,
  changes: Partial<typeof tasks.$inferInsert>,
  movedToProject: string | null,
): string {
  const keys = Object.keys(changes).filter((key) => key !== 'completedAt');
  const label = `“${changes.name ?? name}”`;
  if (keys.length === 1) {
    if (changes.status === 'COMPLETED') return `Completed ${label}`;
    if (changes.status) return `Moved ${label} to ${TASK_STATUS_LABELS[changes.status]}`;
    if (changes.priority)
      return `Set ${label} to ${TASK_PRIORITY_LABELS[changes.priority]} priority`;
    if (movedToProject) return `Moved ${label} to project “${movedToProject}”`;
    if (changes.name) return `Renamed “${name}” to ${label}`;
    if ('dueDate' in changes)
      return changes.dueDate ? `Set due date of ${label}` : `Cleared due date of ${label}`;
  }
  if (changes.status === 'COMPLETED') return `Completed ${label}`;
  return `Updated task ${label}`;
}

export type TasksService = ReturnType<typeof createTasksService>;

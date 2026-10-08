import {
  isDateRangeValid,
  PROJECT_STATUS_LABELS,
  type CreateProjectData,
  type Project,
  type ProjectListQuery,
  type ProjectTaskStats,
  type UpdateProjectData,
} from '@lumen/shared';
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/client';
import { projects, tasks, type ProjectRow } from '../../db/schema';
import { errors } from '../../lib/errors';
import type { RequestContext } from '../../lib/request';
import { containsPattern, pageMeta } from '../../lib/sql';
import { recordAudit } from '../activity/audit.service';

const EMPTY_STATS: ProjectTaskStats = {
  total: 0,
  completed: 0,
  inProgress: 0,
  pending: 0,
  overdue: 0,
  progress: 0,
};

export function toProject(row: ProjectRow, stats: ProjectTaskStats = EMPTY_STATS): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    taskStats: stats,
  };
}

/** Today in UTC as YYYY-MM-DD; clients may pass their local date instead. */
export const utcToday = () => new Date().toISOString().slice(0, 10);

/** Task counts per project in one grouped query. */
async function statsFor(
  db: DbExecutor,
  projectIds: string[],
  today: string,
): Promise<Map<string, ProjectTaskStats>> {
  const result = new Map<string, ProjectTaskStats>();
  if (projectIds.length === 0) return result;

  const rows = await db
    .select({
      projectId: tasks.projectId,
      total: count(),
      completed: count(sql`CASE WHEN ${tasks.status} = 'COMPLETED' THEN 1 END`),
      inProgress: count(sql`CASE WHEN ${tasks.status} = 'IN_PROGRESS' THEN 1 END`),
      pending: count(sql`CASE WHEN ${tasks.status} = 'PENDING' THEN 1 END`),
      overdue: count(
        sql`CASE WHEN ${tasks.status} <> 'COMPLETED' AND ${tasks.dueDate} < ${today}::date THEN 1 END`,
      ),
    })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds))
    .groupBy(tasks.projectId);

  for (const row of rows) {
    result.set(row.projectId, {
      total: row.total,
      completed: row.completed,
      inProgress: row.inProgress,
      pending: row.pending,
      overdue: row.overdue,
      progress: row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100),
    });
  }
  return result;
}

const SORT_COLUMNS = {
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  name: projects.name,
  status: projects.status,
  startDate: projects.startDate,
  endDate: projects.endDate,
} as const;

/** Every query is scoped to the owner. There is no code path that reads a project by id alone. */
const ownedBy = (userId: string, id: string) =>
  and(eq(projects.id, id), eq(projects.ownerId, userId));

export function createProjectsService(db: Database) {
  async function list(userId: string, query: ProjectListQuery & { today?: string }) {
    const today = query.today ?? utcToday();
    const filters: SQL[] = [eq(projects.ownerId, userId)];
    if (query.search) filters.push(ilike(projects.name, containsPattern(query.search)));
    if (query.status) filters.push(eq(projects.status, query.status));
    const where = and(...filters);

    const column = SORT_COLUMNS[query.sort];
    const direction = query.order === 'asc' ? asc : desc;
    const nullsLast = query.sort === 'startDate' || query.sort === 'endDate';
    const dir = sql.raw(query.order === 'asc' ? 'ASC' : 'DESC');
    // Names sort case-insensitively; empty dates always sort last.
    const orderBy =
      query.sort === 'name'
        ? sql`lower(${column}) ${dir}`
        : nullsLast
          ? sql`${column} ${dir} NULLS LAST`
          : direction(column);

    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(where)
        .orderBy(orderBy, desc(projects.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(projects).where(where),
    ]);

    const stats = await statsFor(
      db,
      rows.map((r) => r.id),
      today,
    );
    return {
      data: rows.map((row) => toProject(row, stats.get(row.id))),
      meta: pageMeta(query.page, query.limit, total),
    };
  }

  async function get(userId: string, id: string, today = utcToday()): Promise<Project> {
    const [row] = await db.select().from(projects).where(ownedBy(userId, id)).limit(1);
    if (!row) throw errors.notFound('Project');
    const stats = await statsFor(db, [row.id], today);
    return toProject(row, stats.get(row.id));
  }

  async function create(ctx: RequestContext, data: CreateProjectData): Promise<Project> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ ...data, ownerId: ctx.userId })
        .returning();
      if (!row) throw new Error('Failed to create project');
      await recordAudit(tx, {
        userId: ctx.userId,
        action: 'project.create',
        entityType: 'project',
        entityId: row.id,
        summary: `Created project “${row.name}”`,
        platform: ctx.platform,
        ip: ctx.ip,
      });
      return toProject(row);
    });
  }

  async function update(
    ctx: RequestContext,
    id: string,
    data: UpdateProjectData,
  ): Promise<Project> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(projects)
        .where(ownedBy(ctx.userId, id))
        .for('update')
        .limit(1);
      if (!existing) throw errors.notFound('Project');

      // Validate the date range against the stored values for fields not being changed.
      const startDate = data.startDate !== undefined ? data.startDate : existing.startDate;
      const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
      if (!isDateRangeValid(startDate, endDate)) {
        throw errors.validation('End date cannot be before the start date', [
          { path: 'endDate', message: 'End date cannot be before the start date' },
        ]);
      }

      const changes = Object.fromEntries(
        Object.entries(data).filter(
          ([key, value]) => value !== undefined && existing[key as keyof ProjectRow] !== value,
        ),
      ) as Partial<UpdateProjectData>;

      if (Object.keys(changes).length === 0) {
        const stats = await statsFor(tx, [existing.id], utcToday());
        return toProject(existing, stats.get(existing.id));
      }

      const [row] = await tx
        .update(projects)
        .set(changes)
        .where(ownedBy(ctx.userId, id))
        .returning();
      if (!row) throw errors.notFound('Project');

      await recordAudit(tx, {
        userId: ctx.userId,
        action: 'project.update',
        entityType: 'project',
        entityId: row.id,
        summary: describeProjectChange(existing, changes),
        platform: ctx.platform,
        ip: ctx.ip,
        metadata: {
          changes: Object.fromEntries(
            Object.keys(changes).map((key) => [
              key,
              { from: existing[key as keyof ProjectRow], to: row[key as keyof ProjectRow] },
            ]),
          ),
        },
      });
      const stats = await statsFor(tx, [row.id], utcToday());
      return toProject(row, stats.get(row.id));
    });
  }

  async function remove(ctx: RequestContext, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [{ taskCount } = { taskCount: 0 }] = await tx
        .select({ taskCount: count() })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(ownedBy(ctx.userId, id));
      const [deleted] = await tx
        .delete(projects)
        .where(ownedBy(ctx.userId, id))
        .returning({ id: projects.id, name: projects.name });
      if (!deleted) throw errors.notFound('Project');
      await recordAudit(tx, {
        userId: ctx.userId,
        action: 'project.delete',
        entityType: 'project',
        entityId: deleted.id,
        summary:
          taskCount > 0
            ? `Deleted project “${deleted.name}” and its ${taskCount} task${taskCount === 1 ? '' : 's'}`
            : `Deleted project “${deleted.name}”`,
        platform: ctx.platform,
        ip: ctx.ip,
      });
    });
  }

  return { list, get, create, update, remove };
}

function describeProjectChange(before: ProjectRow, changes: Partial<UpdateProjectData>): string {
  const keys = Object.keys(changes);
  if (keys.length === 1 && changes.status) {
    return `Moved project “${before.name}” to ${PROJECT_STATUS_LABELS[changes.status]}`;
  }
  if (keys.length === 1 && changes.name) {
    return `Renamed project “${before.name}” to “${changes.name}”`;
  }
  return `Updated project “${changes.name ?? before.name}”`;
}

export type ProjectsService = ReturnType<typeof createProjectsService>;

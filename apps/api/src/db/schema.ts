import { PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from '@lumen/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/*
 * Relational model (3NF):
 *   users 1──* projects 1──* tasks
 *   users 1──* sessions        (one row per signed-in device)
 *   users 1──* audit_logs      (append-only activity trail)
 *
 * Tasks do not store an owner column: ownership is derived through
 * tasks.project_id → projects.owner_id, so it can never drift.
 */

export const projectStatus = pgEnum('project_status', PROJECT_STATUSES);
export const taskStatus = pgEnum('task_status', TASK_STATUSES);
/** Declared LOW → HIGH so ORDER BY priority sorts by urgency. */
export const taskPriority = pgEnum('task_priority', TASK_PRIORITIES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  /** Stored lower-cased and trimmed, so the unique constraint is case-insensitive. */
  email: varchar('email', { length: 254 }).notNull().unique('users_email_unique'),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull().default(''),
    status: projectStatus('status').notNull().default('NOT_STARTED'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    index('projects_owner_created_idx').on(t.ownerId, t.createdAt),
    index('projects_owner_status_idx').on(t.ownerId, t.status),
    index('projects_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    check(
      'projects_date_range_chk',
      sql`${t.startDate} IS NULL OR ${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check('projects_name_not_blank_chk', sql`length(btrim(${t.name})) > 0`),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description').notNull().default(''),
    priority: taskPriority('priority').notNull().default('MEDIUM'),
    status: taskStatus('status').notNull().default('PENDING'),
    dueDate: date('due_date', { mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('tasks_project_created_idx').on(t.projectId, t.createdAt),
    index('tasks_project_status_idx').on(t.projectId, t.status),
    index('tasks_project_priority_idx').on(t.projectId, t.priority),
    index('tasks_project_due_idx').on(t.projectId, t.dueDate),
    index('tasks_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    check('tasks_name_not_blank_chk', sql`length(btrim(${t.name})) > 0`),
    check(
      'tasks_completed_at_chk',
      sql`(${t.status} = 'COMPLETED') = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the current refresh token. The token itself is never stored. */
    refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull().unique(),
    /** Hash of the token this one replaced, used to detect replay of a rotated token. */
    previousTokenHash: varchar('previous_token_hash', { length: 64 }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'date' }),
    platform: varchar('platform', { length: 16 }).notNull().default('unknown'),
    userAgent: varchar('user_agent', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: varchar('revoked_reason', { length: 32 }),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_previous_hash_idx').on(t.previousTokenHash),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 48 }).notNull(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    /** Not a foreign key on purpose: the trail must outlive deleted projects and tasks. */
    entityId: uuid('entity_id'),
    summary: varchar('summary', { length: 300 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull().default('unknown'),
    ipAddress: varchar('ip_address', { length: 64 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_user_created_idx').on(t.userId, t.createdAt.desc())],
);

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;

import { z } from 'zod';
import {
  PROJECT_SORT_FIELDS,
  PROJECT_STATUSES,
  SORT_ORDERS,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
} from './enums';
import { LIMITS } from './limits';

/* ------------------------------------------------------------------ */
/* Field builders                                                      */
/* ------------------------------------------------------------------ */

/** A required string that is trimmed and must not be blank after trimming. */
const requiredText = (field: string, min: number, max: number) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined || issue.input === null
          ? `${field} is required`
          : `${field} must be text`,
    })
    .trim()
    .min(min, min <= 1 ? `${field} cannot be empty` : `${field} must be at least ${min} characters`)
    .max(max, `${field} must be at most ${max} characters`);

/** Optional free text; blank input is stored as an empty string. */
const optionalText = (field: string, max: number) =>
  z
    .string({ error: `${field} must be text` })
    .trim()
    .max(max, `${field} must be at most ${max} characters`);

const enumField = <const T extends readonly [string, ...string[]]>(field: string, values: T) =>
  z.enum(values, {
    error: (issue) =>
      issue.input === undefined
        ? `${field} is required`
        : `${field} must be one of: ${values.join(', ')}`,
  });

/** True when `value` (YYYY-MM-DD) names a real calendar day, e.g. rejects 2026-02-30. */
export function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900 || year > 2999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A calendar date in ISO `YYYY-MM-DD` form. Blank strings become `null`. */
const isoDate = (field: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string({ error: `${field} must be a date in YYYY-MM-DD format` })
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${field} must be a date in YYYY-MM-DD format`)
      .refine(isRealCalendarDate, `${field} is not a valid calendar date`)
      .nullable(),
  );

const uuid = (field: string) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${field} is required` : `${field} must be a valid id`,
    })
    .trim()
    .pipe(z.uuid({ error: `${field} must be a valid id` }));

const atLeastOneField = (value: Record<string, unknown>) =>
  Object.values(value).some((v) => v !== undefined);

/** `end` must not fall before `start` when both are present. */
export function isDateRangeValid(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return true;
  return end >= start; // ISO dates compare correctly as strings
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const emailSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Email is required' : 'Email must be text'),
  })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(LIMITS.email.max, `Email must be at most ${LIMITS.email.max} characters`)
  .pipe(z.email({ error: 'Enter a valid email address' }));

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const passwordSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'Password is required' : 'Password must be text',
  })
  .min(LIMITS.password.min, `Password must be at least ${LIMITS.password.min} characters`)
  .refine(
    (value) => utf8Length(value) <= LIMITS.password.maxBytes,
    `Password must be at most ${LIMITS.password.maxBytes} bytes`,
  )
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain at least one letter and one number',
  })
  .refine((value) => value.trim() === value, {
    message: 'Password cannot start or end with a space',
  });

export const registerSchema = z.strictObject({
  fullName: requiredText('Full name', LIMITS.fullName.min, LIMITS.fullName.max).refine(
    (value) => !/[<>]/.test(value),
    'Full name cannot contain < or >',
  ),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Password is required' : 'Password must be text',
    })
    .min(1, 'Password is required')
    .max(256, 'Password is too long'),
});

export const refreshSchema = z.strictObject({
  refreshToken: z.string().trim().min(1).max(512).optional(),
});

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

const projectFields = {
  name: requiredText('Project name', LIMITS.projectName.min, LIMITS.projectName.max),
  description: optionalText('Description', LIMITS.description.max),
  status: enumField('Status', PROJECT_STATUSES),
  startDate: isoDate('Start date'),
  endDate: isoDate('End date'),
};

const dateRangeIssue = {
  message: 'End date cannot be before the start date',
  path: ['endDate'],
};

export const createProjectSchema = z
  .strictObject({
    name: projectFields.name,
    description: projectFields.description.default(''),
    status: projectFields.status.default('NOT_STARTED'),
    startDate: projectFields.startDate.optional().default(null),
    endDate: projectFields.endDate.optional().default(null),
  })
  .refine((p) => isDateRangeValid(p.startDate, p.endDate), dateRangeIssue);

export const updateProjectSchema = z
  .strictObject({
    name: projectFields.name.optional(),
    description: projectFields.description.optional(),
    status: projectFields.status.optional(),
    startDate: projectFields.startDate.optional(),
    endDate: projectFields.endDate.optional(),
  })
  .refine(atLeastOneField, { message: 'Provide at least one field to update' })
  .refine((p) => isDateRangeValid(p.startDate, p.endDate), dateRangeIssue);

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

const taskFields = {
  projectId: uuid('Project'),
  name: requiredText('Task name', LIMITS.taskName.min, LIMITS.taskName.max),
  description: optionalText('Description', LIMITS.description.max),
  priority: enumField('Priority', TASK_PRIORITIES),
  status: enumField('Status', TASK_STATUSES),
  dueDate: isoDate('Due date'),
};

export const createTaskSchema = z.strictObject({
  projectId: taskFields.projectId,
  name: taskFields.name,
  description: taskFields.description.default(''),
  priority: taskFields.priority.default('MEDIUM'),
  status: taskFields.status.default('PENDING'),
  dueDate: taskFields.dueDate.optional().default(null),
});

export const updateTaskSchema = z
  .strictObject({
    projectId: taskFields.projectId.optional(),
    name: taskFields.name.optional(),
    description: taskFields.description.optional(),
    priority: taskFields.priority.optional(),
    status: taskFields.status.optional(),
    dueDate: taskFields.dueDate.optional(),
  })
  .refine(atLeastOneField, { message: 'Provide at least one field to update' });

/* ------------------------------------------------------------------ */
/* Query strings                                                       */
/* ------------------------------------------------------------------ */

const searchParam = z
  .string()
  .trim()
  .max(LIMITS.search.max, `Search must be at most ${LIMITS.search.max} characters`)
  .optional()
  .transform((value) => (value ? value : undefined));

const pageParam = z.coerce
  .number({ error: 'page must be a number' })
  .int('page must be a whole number')
  .min(1, 'page must be at least 1')
  .max(LIMITS.page.max, `page must be at most ${LIMITS.page.max}`)
  .default(1);

const limitParam = z.coerce
  .number({ error: 'limit must be a number' })
  .int('limit must be a whole number')
  .min(1, 'limit must be at least 1')
  .max(LIMITS.pageSize.max, `limit must be at most ${LIMITS.pageSize.max}`)
  .default(LIMITS.pageSize.default);

const orderParam = enumField('order', SORT_ORDERS).default('desc');

const booleanParam = (field: string) =>
  z
    .enum(['true', 'false'], { error: `${field} must be true or false` })
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true'));

/**
 * The client's local calendar date. "Overdue" depends on the user's time zone, so clients
 * send their own today; the API falls back to the UTC date when it is absent.
 */
const todayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'today must be a date in YYYY-MM-DD format')
  .refine(isRealCalendarDate, 'today is not a valid calendar date')
  .optional();

export const projectListQuerySchema = z.strictObject({
  search: searchParam,
  status: enumField('status', PROJECT_STATUSES).optional(),
  page: pageParam,
  limit: limitParam,
  sort: enumField('sort', PROJECT_SORT_FIELDS).default('createdAt'),
  order: orderParam,
  today: todayParam,
});

export const taskListQuerySchema = z.strictObject({
  projectId: uuid('projectId').optional(),
  search: searchParam,
  status: enumField('status', TASK_STATUSES).optional(),
  priority: enumField('priority', TASK_PRIORITIES).optional(),
  overdue: booleanParam('overdue'),
  page: pageParam,
  limit: limitParam,
  sort: enumField('sort', TASK_SORT_FIELDS).default('createdAt'),
  order: orderParam,
  today: todayParam,
});

export const dashboardQuerySchema = z.strictObject({
  today: todayParam,
});

export const todayQuerySchema = dashboardQuerySchema;

export const idParamSchema = z.strictObject({
  id: uuid('id'),
});

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectData = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type UpdateProjectData = z.output<typeof updateProjectSchema>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskData = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type UpdateTaskData = z.output<typeof updateTaskSchema>;
export type ProjectListQuery = z.output<typeof projectListQuerySchema>;
export type ProjectListQueryInput = z.input<typeof projectListQuerySchema>;
export type TaskListQuery = z.output<typeof taskListQuerySchema>;
export type TaskListQueryInput = z.input<typeof taskListQuerySchema>;

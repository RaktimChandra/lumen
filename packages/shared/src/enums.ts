/**
 * Domain enums. Values are stable machine identifiers used by the API,
 * database and clients; labels are what people see.
 */

export const PROJECT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Ordered from least to most urgent; the database enum keeps this order for sorting. */
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const PROJECT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'status',
  'startDate',
  'endDate',
] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export const TASK_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'status',
  'priority',
  'dueDate',
] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

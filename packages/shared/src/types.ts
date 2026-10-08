import type {
  ProjectSortField,
  ProjectStatus,
  SortOrder,
  TaskPriority,
  TaskSortField,
  TaskStatus,
} from './enums';

/** Public user profile. Never includes the password hash. */
export interface User {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  /**
   * Returned only to native clients (header `X-Client-Platform: mobile`).
   * Browsers receive it as an httpOnly cookie instead.
   */
  refreshToken?: string;
}

export interface Session {
  id: string;
  platform: 'web' | 'mobile' | 'unknown';
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface ProjectTaskStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  /** 0–100, rounded. 0 when the project has no tasks. */
  progress: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  taskStats: ProjectTaskStats;
}

export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the task is not completed and its due date is before today (the client's date when sent, else UTC). */
  isOverdue: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Dashboard {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  /** Tasks whose status is Pending (not yet started). */
  pendingTasks: number;
  projectsInProgress: number;
  /** Tasks not yet completed (Pending + In Progress). */
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  dueThisWeek: number;
  /** completedTasks / totalTasks as 0–100, rounded. */
  completionRate: number;
  projectsByStatus: Record<ProjectStatus, number>;
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<TaskPriority, number>;
  upcomingTasks: Task[];
  recentActivity: ActivityEntry[];
}

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.session_revoked'
  | 'auth.refresh_reuse_detected'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'task.create'
  | 'task.update'
  | 'task.complete'
  | 'task.delete';

export interface ActivityEntry {
  id: string;
  action: AuditAction;
  entityType: 'user' | 'project' | 'task' | 'session';
  entityId: string | null;
  summary: string;
  platform: 'web' | 'mobile' | 'unknown';
  createdAt: string;
}

export interface ApiFieldError {
  path: string;
  message: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiFieldError[];
    requestId?: string;
  };
}

/** Query parameters accepted by `GET /api/projects`. */
export interface ProjectListParams {
  search?: string;
  status?: ProjectStatus;
  page?: number;
  limit?: number;
  sort?: ProjectSortField;
  order?: SortOrder;
  today?: string;
}

/** Query parameters accepted by `GET /api/tasks`. */
export interface TaskListParams {
  projectId?: string;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  overdue?: boolean;
  page?: number;
  limit?: number;
  sort?: TaskSortField;
  order?: SortOrder;
  today?: string;
}

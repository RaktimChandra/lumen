import {
  createProjectSchema,
  createTaskSchema,
  loginSchema,
  PROJECT_SORT_FIELDS,
  PROJECT_STATUSES,
  refreshSchema,
  registerSchema,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
  updateProjectSchema,
  updateTaskSchema,
} from '@lumen/shared';
import { z } from 'zod';

/** Request bodies are generated from the same zod schemas the API validates with. */
const body = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', target: 'openapi-3.0' });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const errorResponse = (description: string) => ({ description, content: json(ref('Error')) });

const common = {
  400: errorResponse('Validation failed. `details` lists each invalid field.'),
  401: errorResponse(
    'Missing, invalid or expired access token (`TOKEN_EXPIRED`), or ended session (`SESSION_EXPIRED`).',
  ),
  429: errorResponse('Rate limit exceeded. See `Retry-After`.'),
};
const notFound = { 404: errorResponse('Not found, or owned by another user.') };

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const todayParam = {
  name: 'today',
  in: 'query',
  required: false,
  description:
    "Client's local date (YYYY-MM-DD) used to compute overdue. Defaults to the UTC date.",
  schema: { type: 'string', format: 'date' },
};
const pagingParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  {
    name: 'order',
    in: 'query',
    schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
  },
];
const searchParam = {
  name: 'search',
  in: 'query',
  description: 'Case-insensitive substring match on name (wildcards are matched literally).',
  schema: { type: 'string', maxLength: 100 },
};

const secured = [{ bearerAuth: [] }];

export function buildOpenApiDocument(serverUrl = '/') {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Lumen API',
      version: '1.0.0',
      description: [
        'One REST API for the Lumen web app and Android app.',
        '',
        '**Authentication.** `POST /api/auth/login` returns a 15-minute JWT access token. Send it as',
        '`Authorization: Bearer <token>`. Browsers also receive an httpOnly refresh cookie; the mobile',
        'app (header `X-Client-Platform: mobile`) receives `refreshToken` in the body instead.',
        'Call `POST /api/auth/refresh` when a request fails with `TOKEN_EXPIRED`.',
        '',
        '**Ownership.** Every project and task is scoped to the signed-in user. Requests for',
        "another user's data return 404, exactly like data that does not exist.",
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Auth' },
      { name: 'Projects' },
      { name: 'Tasks' },
      { name: 'Dashboard' },
      { name: 'Activity' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        RegisterRequest: body(registerSchema),
        LoginRequest: body(loginSchema),
        RefreshRequest: body(refreshSchema),
        CreateProjectRequest: body(createProjectSchema),
        UpdateProjectRequest: body(updateProjectSchema),
        CreateTaskRequest: body(createTaskSchema),
        UpdateTaskRequest: body(updateTaskSchema),
        User: {
          type: 'object',
          required: ['id', 'fullName', 'email', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          required: ['user', 'accessToken', 'expiresIn'],
          properties: {
            user: ref('User'),
            accessToken: { type: 'string' },
            expiresIn: { type: 'integer', example: 900 },
            refreshToken: { type: 'string', description: 'Mobile clients only.' },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            platform: { type: 'string', enum: ['web', 'mobile', 'unknown'] },
            userAgent: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsedAt: { type: 'string', format: 'date-time' },
            current: { type: 'boolean' },
          },
        },
        TaskStats: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            completed: { type: 'integer' },
            inProgress: { type: 'integer' },
            pending: { type: 'integer' },
            overdue: { type: 'integer' },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: [...PROJECT_STATUSES] },
            startDate: { type: 'string', format: 'date', nullable: true },
            endDate: { type: 'string', format: 'date', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            taskStats: ref('TaskStats'),
          },
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            projectName: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: [...TASK_PRIORITIES] },
            status: { type: 'string', enum: [...TASK_STATUSES] },
            dueDate: { type: 'string', format: 'date', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            isOverdue: { type: 'boolean' },
          },
        },
        PageMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            action: { type: 'string', example: 'task.complete' },
            entityType: { type: 'string', enum: ['user', 'project', 'task', 'session'] },
            entityId: { type: 'string', format: 'uuid', nullable: true },
            summary: { type: 'string', example: 'Completed “Align the optical bench”' },
            platform: { type: 'string', enum: ['web', 'mobile', 'unknown'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Dashboard: {
          type: 'object',
          properties: {
            totalProjects: { type: 'integer' },
            totalTasks: { type: 'integer' },
            completedTasks: { type: 'integer' },
            pendingTasks: { type: 'integer', description: 'Tasks with status PENDING.' },
            projectsInProgress: { type: 'integer' },
            openTasks: { type: 'integer', description: 'Tasks not completed.' },
            inProgressTasks: { type: 'integer' },
            overdueTasks: { type: 'integer' },
            dueThisWeek: { type: 'integer' },
            completionRate: { type: 'integer' },
            projectsByStatus: { type: 'object', additionalProperties: { type: 'integer' } },
            tasksByStatus: { type: 'object', additionalProperties: { type: 'integer' } },
            tasksByPriority: { type: 'object', additionalProperties: { type: 'integer' } },
            upcomingTasks: { type: 'array', items: ref('Task') },
            recentActivity: { type: 'array', items: ref('Activity') },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'VALIDATION_ERROR',
                    'BAD_REQUEST',
                    'UNAUTHORIZED',
                    'TOKEN_EXPIRED',
                    'SESSION_EXPIRED',
                    'INVALID_CREDENTIALS',
                    'NOT_FOUND',
                    'CONFLICT',
                    'PAYLOAD_TOO_LARGE',
                    'RATE_LIMITED',
                    'INTERNAL_ERROR',
                  ],
                },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Create an account and sign in',
          requestBody: { required: true, content: json(ref('RegisterRequest')) },
          responses: {
            201: { description: 'Account created', content: json(ref('AuthResponse')) },
            400: common[400],
            409: errorResponse('Email already registered.'),
            429: common[429],
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in with email and password',
          description:
            'Rate limited per IP and per email (failed attempts only). Unknown emails and wrong passwords return the same error.',
          requestBody: { required: true, content: json(ref('LoginRequest')) },
          responses: {
            200: { description: 'Signed in', content: json(ref('AuthResponse')) },
            400: common[400],
            401: errorResponse('`INVALID_CREDENTIALS`'),
            429: common[429],
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Exchange a refresh token for a new access token',
          description:
            'Reads the refresh token from the `lumen_rt` cookie (web) or the body (mobile). The refresh token is rotated on every use; replaying an old one signs that session out.',
          requestBody: { required: false, content: json(ref('RefreshRequest')) },
          responses: {
            200: { description: 'New tokens', content: json(ref('AuthResponse')) },
            401: errorResponse('`SESSION_EXPIRED`'),
            429: common[429],
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Sign out the current session',
          description:
            'Revokes the session server-side so its access token stops working immediately. Accepts an expired access token or just the refresh token. Always 204.',
          security: [{ bearerAuth: [] }, {}],
          requestBody: { required: false, content: json(ref('RefreshRequest')) },
          responses: { 204: { description: 'Signed out' } },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user',
          security: secured,
          responses: {
            200: {
              description: 'The signed-in user',
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            401: common[401],
          },
        },
      },
      '/api/auth/sessions': {
        get: {
          tags: ['Auth'],
          summary: 'Signed-in devices',
          security: secured,
          responses: {
            200: {
              description: 'Active sessions',
              content: json({
                type: 'object',
                properties: { data: { type: 'array', items: ref('Session') } },
              }),
            },
            401: common[401],
          },
        },
      },
      '/api/auth/sessions/{id}': {
        delete: {
          tags: ['Auth'],
          summary: 'Sign out a device',
          security: secured,
          parameters: [idParam],
          responses: { 204: { description: 'Session revoked' }, 401: common[401], ...notFound },
        },
      },
      '/api/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List your projects',
          security: secured,
          parameters: [
            searchParam,
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: [...PROJECT_STATUSES] },
            },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: [...PROJECT_SORT_FIELDS], default: 'createdAt' },
            },
            ...pagingParams,
            todayParam,
          ],
          responses: {
            200: {
              description: 'A page of projects with task statistics',
              content: json({
                type: 'object',
                properties: {
                  data: { type: 'array', items: ref('Project') },
                  meta: ref('PageMeta'),
                },
              }),
            },
            400: common[400],
            401: common[401],
          },
        },
        post: {
          tags: ['Projects'],
          summary: 'Create a project',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateProjectRequest')) },
          responses: {
            201: {
              description: 'Created',
              content: json({ type: 'object', properties: { data: ref('Project') } }),
            },
            400: common[400],
            401: common[401],
          },
        },
      },
      '/api/projects/{id}': {
        parameters: [idParam],
        get: {
          tags: ['Projects'],
          summary: 'Get a project',
          security: secured,
          parameters: [todayParam],
          responses: {
            200: {
              description: 'The project',
              content: json({ type: 'object', properties: { data: ref('Project') } }),
            },
            401: common[401],
            ...notFound,
          },
        },
        put: {
          tags: ['Projects'],
          summary: 'Update a project',
          description:
            'Send any subset of fields; omitted fields are unchanged. PATCH is accepted as an alias.',
          security: secured,
          requestBody: { required: true, content: json(ref('UpdateProjectRequest')) },
          responses: {
            200: {
              description: 'Updated',
              content: json({ type: 'object', properties: { data: ref('Project') } }),
            },
            400: common[400],
            401: common[401],
            ...notFound,
          },
        },
        delete: {
          tags: ['Projects'],
          summary: 'Delete a project and its tasks',
          security: secured,
          responses: { 204: { description: 'Deleted' }, 401: common[401], ...notFound },
        },
      },
      '/api/tasks': {
        get: {
          tags: ['Tasks'],
          summary: 'List your tasks',
          security: secured,
          parameters: [
            { name: 'projectId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            searchParam,
            { name: 'status', in: 'query', schema: { type: 'string', enum: [...TASK_STATUSES] } },
            {
              name: 'priority',
              in: 'query',
              schema: { type: 'string', enum: [...TASK_PRIORITIES] },
            },
            { name: 'overdue', in: 'query', schema: { type: 'boolean' } },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: [...TASK_SORT_FIELDS], default: 'createdAt' },
            },
            ...pagingParams,
            todayParam,
          ],
          responses: {
            200: {
              description: 'A page of tasks',
              content: json({
                type: 'object',
                properties: { data: { type: 'array', items: ref('Task') }, meta: ref('PageMeta') },
              }),
            },
            400: common[400],
            401: common[401],
          },
        },
        post: {
          tags: ['Tasks'],
          summary: 'Create a task in one of your projects',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateTaskRequest')) },
          responses: {
            201: {
              description: 'Created',
              content: json({ type: 'object', properties: { data: ref('Task') } }),
            },
            400: common[400],
            401: common[401],
            404: errorResponse('The project does not exist or is not yours.'),
          },
        },
      },
      '/api/tasks/{id}': {
        parameters: [idParam],
        get: {
          tags: ['Tasks'],
          summary: 'Get a task',
          security: secured,
          parameters: [todayParam],
          responses: {
            200: {
              description: 'The task',
              content: json({ type: 'object', properties: { data: ref('Task') } }),
            },
            401: common[401],
            ...notFound,
          },
        },
        put: {
          tags: ['Tasks'],
          summary: 'Update a task (status, priority, details, or move to another project)',
          description:
            'Send any subset of fields. Setting `status` to `COMPLETED` marks the task completed and records `completedAt`. PATCH is accepted as an alias.',
          security: secured,
          requestBody: { required: true, content: json(ref('UpdateTaskRequest')) },
          responses: {
            200: {
              description: 'Updated',
              content: json({ type: 'object', properties: { data: ref('Task') } }),
            },
            400: common[400],
            401: common[401],
            ...notFound,
          },
        },
        delete: {
          tags: ['Tasks'],
          summary: 'Delete a task',
          security: secured,
          responses: { 204: { description: 'Deleted' }, 401: common[401], ...notFound },
        },
      },
      '/api/dashboard': {
        get: {
          tags: ['Dashboard'],
          summary: 'Totals for the signed-in user',
          security: secured,
          parameters: [todayParam],
          responses: {
            200: {
              description: 'Dashboard',
              content: json({ type: 'object', properties: { data: ref('Dashboard') } }),
            },
            401: common[401],
          },
        },
      },
      '/api/activity': {
        get: {
          tags: ['Activity'],
          summary: 'Audit trail of your actions, newest first',
          security: secured,
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
            },
          ],
          responses: {
            200: {
              description: 'Entries',
              content: json({
                type: 'object',
                properties: { data: { type: 'array', items: ref('Activity') } },
              }),
            },
            401: common[401],
          },
        },
      },
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Liveness and database check',
          security: [],
          responses: {
            200: { description: 'Healthy' },
            503: { description: 'Database unreachable' },
          },
        },
      },
    },
  };
}

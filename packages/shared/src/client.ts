import type {
  CreateProjectInput,
  CreateTaskInput,
  LoginInput,
  RegisterInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './schemas';
import type {
  ActivityEntry,
  ApiErrorBody,
  ApiErrorCode,
  ApiFieldError,
  AuthResponse,
  Dashboard,
  Paginated,
  Project,
  ProjectListParams,
  Session,
  Task,
  TaskListParams,
  User,
} from './types';

export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT';

/** Error thrown for every failed request, whether the server answered or not. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: ApiFieldError[];
  readonly requestId?: string;

  constructor(
    status: number,
    code: ClientErrorCode,
    message: string,
    details: ApiFieldError[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** True when the request never got an answer (offline, DNS, timeout). */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  /** Message for a single field, if the server reported one. */
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }
}

export type SessionEndReason = 'expired' | 'revoked';

export interface ApiClientOptions {
  /** API origin, e.g. `https://api.example.com`. Use `''` for same-origin (web proxy). */
  baseUrl: string;
  platform: 'web' | 'mobile';
  getAccessToken: () => string | null;
  /**
   * Obtain a fresh access token (web: refresh cookie; mobile: stored refresh token).
   * Return `null` when the session cannot be renewed.
   */
  refreshAccessToken: () => Promise<string | null>;
  /** Called once when a protected request fails because the session is over. */
  onSessionEnded: (reason: SessionEndReason) => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Attach the bearer token and handle expiry. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

const NETWORK_MESSAGE = "Can't reach the Lumen server. Check your connection and try again.";
const TIMEOUT_MESSAGE = 'The server took too long to respond. Try again in a moment.';

function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 20_000;
  let refreshInFlight: Promise<string | null> | null = null;
  let sessionEndedNotified = false;

  /** Single-flight refresh: concurrent 401s share one refresh call. */
  function refreshOnce(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = options
        .refreshAccessToken()
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  function endSession(reason: SessionEndReason) {
    if (sessionEndedNotified) return;
    sessionEndedNotified = true;
    options.onSessionEnded(reason);
  }

  async function send(
    method: string,
    path: string,
    opts: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Platform': options.platform,
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      return await fetchImpl(`${options.baseUrl}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      if (controller.signal.aborted) throw new ApiError(0, 'TIMEOUT', TIMEOUT_MESSAGE);
      throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function toApiError(response: Response): Promise<ApiError> {
    let body: Partial<ApiErrorBody> | null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    const err = body?.error;
    if (err?.code && err.message) {
      return new ApiError(response.status, err.code, err.message, err.details ?? [], err.requestId);
    }
    if (response.status >= 500) {
      return new ApiError(
        response.status,
        'INTERNAL_ERROR',
        'The server ran into a problem. Try again in a moment.',
      );
    }
    return new ApiError(response.status, 'BAD_REQUEST', `Request failed (${response.status})`);
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth ?? true;
    let token = auth ? options.getAccessToken() : null;

    // No token in memory yet (e.g. page reload on web): try to restore before calling.
    if (auth && !token) {
      token = await refreshOnce();
      if (!token) {
        endSession('expired');
        throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
      }
    }

    let response = await send(method, path, opts, token);

    if (auth && response.status === 401) {
      const firstError = await toApiError(response);
      if (firstError.code === 'TOKEN_EXPIRED' || firstError.code === 'UNAUTHORIZED') {
        const renewed = await refreshOnce();
        if (renewed) {
          response = await send(method, path, opts, renewed);
        } else {
          endSession('expired');
          throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
        }
      } else {
        endSession(firstError.code === 'SESSION_EXPIRED' ? 'revoked' : 'expired');
        throw firstError;
      }
      if (response.status === 401) {
        const err = await toApiError(response);
        endSession('expired');
        throw err;
      }
    }

    if (!response.ok) throw await toApiError(response);
    if (auth) sessionEndedNotified = false;
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    request,
    /** Reset the "session ended" latch after a fresh sign-in. */
    resetSessionState() {
      sessionEndedNotified = false;
    },
    auth: {
      register: (input: RegisterInput) =>
        request<AuthResponse>('POST', '/api/auth/register', { body: input, auth: false }),
      login: (input: LoginInput) =>
        request<AuthResponse>('POST', '/api/auth/login', { body: input, auth: false }),
      refresh: (refreshToken?: string) =>
        request<AuthResponse>('POST', '/api/auth/refresh', {
          body: refreshToken ? { refreshToken } : {},
          auth: false,
        }),
      logout: (accessToken: string | null, refreshToken?: string) =>
        // Logout must work even with an expired access token, so it bypasses the retry flow.
        send(
          'POST',
          '/api/auth/logout',
          { body: refreshToken ? { refreshToken } : {} },
          accessToken,
        )
          .then(() => undefined)
          .catch(() => undefined),
      me: () => request<{ user: User }>('GET', '/api/auth/me'),
      sessions: () => request<{ data: Session[] }>('GET', '/api/auth/sessions'),
      revokeSession: (id: string) => request<void>('DELETE', `/api/auth/sessions/${id}`),
    },
    projects: {
      list: (query: ProjectListParams = {}, signal?: AbortSignal) =>
        request<Paginated<Project>>('GET', '/api/projects', { query: { ...query }, signal }),
      get: (id: string) => request<{ data: Project }>('GET', `/api/projects/${id}`),
      create: (input: CreateProjectInput) =>
        request<{ data: Project }>('POST', '/api/projects', { body: input }),
      update: (id: string, input: UpdateProjectInput) =>
        request<{ data: Project }>('PUT', `/api/projects/${id}`, { body: input }),
      remove: (id: string) => request<void>('DELETE', `/api/projects/${id}`),
    },
    tasks: {
      list: (query: TaskListParams = {}, signal?: AbortSignal) =>
        request<Paginated<Task>>('GET', '/api/tasks', { query: { ...query }, signal }),
      get: (id: string) => request<{ data: Task }>('GET', `/api/tasks/${id}`),
      create: (input: CreateTaskInput) =>
        request<{ data: Task }>('POST', '/api/tasks', { body: input }),
      update: (id: string, input: UpdateTaskInput) =>
        request<{ data: Task }>('PUT', `/api/tasks/${id}`, { body: input }),
      remove: (id: string) => request<void>('DELETE', `/api/tasks/${id}`),
    },
    dashboard: {
      get: () => request<{ data: Dashboard }>('GET', '/api/dashboard'),
    },
    activity: {
      list: (limit = 30) =>
        request<{ data: ActivityEntry[] }>('GET', '/api/activity', { query: { limit } }),
    },
    health: () =>
      request<{ status: string; database: string; uptime: number }>('GET', '/api/health', {
        auth: false,
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

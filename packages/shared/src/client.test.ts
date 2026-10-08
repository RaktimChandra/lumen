import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(
  responses: ((url: string, init: RequestInit) => Response | Promise<Response>)[],
  token: string | null = 'old',
) {
  let accessToken = token;
  const calls: { url: string; auth?: string }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next(url, init);
  });
  const refreshAccessToken = vi.fn(async () => {
    accessToken = 'new';
    return 'new';
  });
  const onSessionEnded = vi.fn();
  const client = createApiClient({
    baseUrl: 'https://api.test',
    platform: 'mobile',
    getAccessToken: () => accessToken,
    refreshAccessToken,
    onSessionEnded,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls, refreshAccessToken, onSessionEnded };
}

describe('createApiClient', () => {
  it('sends the bearer token, platform header and query string', async () => {
    const { client, calls } = setup([() => json(200, { data: [], meta: {} })]);
    await client.tasks.list({ status: 'PENDING', search: '', page: 2 });
    expect(calls[0]!.url).toMatch(
      /^https:\/\/api\.test\/api\/tasks\?today=\d{4}-\d{2}-\d{2}&status=PENDING&page=2$/,
    );
    expect(calls[0]!.auth).toBe('Bearer old');
  });

  it('refreshes once on TOKEN_EXPIRED and retries the request', async () => {
    const { client, calls, refreshAccessToken } = setup([
      () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      () => json(200, { user: { id: '1' } }),
    ]);
    await expect(client.auth.me()).resolves.toEqual({ user: { id: '1' } });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.auth)).toEqual(['Bearer old', 'Bearer new']);
  });

  it('shares one refresh between concurrent requests', async () => {
    const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
    const ok = () => json(200, { user: {} });
    const { client, refreshAccessToken } = setup([expired, expired, ok, ok]);
    await Promise.all([client.auth.me(), client.auth.me()]);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('ends the session when refresh fails', async () => {
    const { client, refreshAccessToken, onSessionEnded } = setup([
      () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
    ]);
    refreshAccessToken.mockResolvedValueOnce(null as never);
    const error = await client.auth.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('SESSION_EXPIRED');
    expect(onSessionEnded).toHaveBeenCalledWith('expired');
  });

  it('keeps the session when the refresh call cannot reach the server', async () => {
    const { client, refreshAccessToken, onSessionEnded } = setup([
      () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
    ]);
    refreshAccessToken.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline') as never);
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('reports a revoked session without trying to refresh', async () => {
    const { client, refreshAccessToken, onSessionEnded } = setup([
      () => json(401, { error: { code: 'SESSION_EXPIRED', message: 'gone' } }),
    ]);
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(onSessionEnded).toHaveBeenCalledWith('revoked');
  });

  it('turns network failures into a friendly NETWORK_ERROR', async () => {
    const { client } = setup([
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]);
    const error = (await client.dashboard.get().catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toMatch(/Check your connection/);
  });

  it('keeps field details from validation errors', async () => {
    const { client } = setup([
      () =>
        json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bad',
            details: [{ path: 'name', message: 'Task name cannot be empty' }],
          },
        }),
    ]);
    const error = (await client.tasks
      .create({ projectId: 'x', name: '' })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.fieldError('name')).toBe('Task name cannot be empty');
  });

  it('returns undefined for 204 responses', async () => {
    const { client } = setup([() => new Response(null, { status: 204 })]);
    await expect(client.tasks.remove('id')).resolves.toBeUndefined();
  });
});

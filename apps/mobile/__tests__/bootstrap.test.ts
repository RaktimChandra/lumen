import { ApiError } from '@lumen/shared';

const mockRefresh = jest.fn();
jest.mock('@/api/client', () => ({
  api: { auth: { refresh: (...args: unknown[]) => mockRefresh(...args), logout: jest.fn() } },
  ApiError: jest.requireActual('@lumen/shared').ApiError,
  refreshSession: jest.fn(),
}));
jest.mock('@/lib/query', () => ({ clearCachedData: jest.fn(async () => undefined) }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

const mockSaved: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  setItemAsync: jest.fn(async (k: string, v: string) => void (mockSaved[k] = v)),
  getItemAsync: jest.fn(async (k: string) => mockSaved[k] ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void delete mockSaved[k]),
}));

import { bootstrapSession } from '@/auth/bootstrap';
import { session } from '@/auth/session';

const user = {
  id: 'u1',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  createdAt: '2026-10-08T00:00:00.000Z',
};

beforeEach(() => {
  mockRefresh.mockReset();
  for (const key of Object.keys(mockSaved)) delete mockSaved[key];
});

describe('launch flow', () => {
  it('stays signed out when nothing is stored', async () => {
    await bootstrapSession();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(session.get().status).toBe('anonymous');
  });

  it('restores the session with the stored refresh token', async () => {
    mockSaved['lumen.refreshToken'] = 'stored-refresh';
    mockRefresh.mockResolvedValue({
      user,
      accessToken: 'fresh',
      expiresIn: 900,
      refreshToken: 'rotated',
    });
    await bootstrapSession();
    expect(mockRefresh).toHaveBeenCalledWith('stored-refresh');
    expect(session.get()).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh',
      refreshToken: 'rotated',
    });
    expect(mockSaved['lumen.refreshToken']).toBe('rotated');
  });

  it('sends the user to sign in with "expired" when the server rejects the token', async () => {
    mockSaved['lumen.refreshToken'] = 'old';
    mockRefresh.mockRejectedValue(new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended.'));
    await bootstrapSession();
    expect(session.get()).toMatchObject({ status: 'anonymous', endReason: 'expired' });
    expect(mockSaved['lumen.refreshToken']).toBeUndefined();
  });

  it('opens offline with saved data when the server cannot be reached', async () => {
    // The app retries in the background; keep that timer under test control.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    mockSaved['lumen.refreshToken'] = 'stored';
    mockSaved['lumen.user'] = JSON.stringify(user);
    mockRefresh.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await bootstrapSession();
    expect(session.get()).toMatchObject({ status: 'authenticated', offline: true, user });
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

import * as SecureStore from 'expo-secure-store';
import { session } from '@/auth/session';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const user = {
  id: 'u1',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  createdAt: '2026-10-08T00:00:00.000Z',
};

describe('mobile session storage', () => {
  it('keeps tokens in SecureStore (Keystore), not AsyncStorage', async () => {
    await session.signIn(user, 'access-1', 'refresh-1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'lumen.accessToken',
      'access-1',
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'lumen.refreshToken',
      'refresh-1',
      expect.any(Object),
    );
    expect(session.get()).toMatchObject({
      status: 'authenticated',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    const loaded = await session.load();
    expect(loaded).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', user });
  });

  it('keeps the current refresh token when a refresh returns none', async () => {
    await session.signIn(user, 'access-1', 'refresh-1');
    await session.signIn(user, 'access-2');
    expect(session.get().refreshToken).toBe('refresh-1');
  });

  it('wipes credentials and records why the session ended', async () => {
    await session.signIn(user, 'access-1', 'refresh-1');
    await session.end('expired');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lumen.refreshToken');
    expect(session.get()).toMatchObject({
      status: 'anonymous',
      user: null,
      accessToken: null,
      endReason: 'expired',
    });
    expect(await session.load()).toEqual({ accessToken: null, refreshToken: null, user: null });
  });
});

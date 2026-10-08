import type { User } from '@lumen/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tokens live in the Android Keystore / iOS Keychain via expo-secure-store,
 * never in AsyncStorage. On web (used only for previews) SecureStore is
 * unavailable, so tokens stay in memory there.
 */
const KEYS = {
  access: 'lumen.accessToken',
  refresh: 'lumen.refreshToken',
  user: 'lumen.user',
} as const;

const secureAvailable = Platform.OS !== 'web';
const memory = new Map<string, string>();

const storage = {
  async get(key: string) {
    return secureAvailable ? SecureStore.getItemAsync(key) : (memory.get(key) ?? null);
  },
  async set(key: string, value: string) {
    if (secureAvailable) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } else memory.set(key, value);
  },
  async remove(key: string) {
    if (secureAvailable) await SecureStore.deleteItemAsync(key);
    else memory.delete(key);
  },
};

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
export type SessionEndReason = 'expired' | 'revoked' | 'signed-out';

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** True when restored from the device without reaching the server (offline start). */
  offline: boolean;
  endReason: SessionEndReason | null;
}

let state: SessionState = {
  status: 'loading',
  user: null,
  accessToken: null,
  refreshToken: null,
  offline: false,
  endReason: null,
};
const listeners = new Set<() => void>();

function emit(next: Partial<SessionState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export const session = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Read saved credentials from secure storage at launch. */
  async load(): Promise<{
    refreshToken: string | null;
    user: User | null;
    accessToken: string | null;
  }> {
    const [accessToken, refreshToken, userJson] = await Promise.all([
      storage.get(KEYS.access),
      storage.get(KEYS.refresh),
      storage.get(KEYS.user),
    ]);
    let user: User | null;
    try {
      user = userJson ? (JSON.parse(userJson) as User) : null;
    } catch {
      user = null;
    }
    return { accessToken, refreshToken, user };
  },

  async signIn(user: User, accessToken: string, refreshToken?: string) {
    const nextRefresh = refreshToken ?? state.refreshToken;
    await Promise.all([
      storage.set(KEYS.access, accessToken),
      nextRefresh ? storage.set(KEYS.refresh, nextRefresh) : Promise.resolve(),
      storage.set(KEYS.user, JSON.stringify(user)),
    ]);
    emit({
      status: 'authenticated',
      user,
      accessToken,
      refreshToken: nextRefresh,
      offline: false,
      endReason: null,
    });
  },

  /** Signed in from saved credentials while the server is unreachable. */
  restoreOffline(user: User, accessToken: string | null, refreshToken: string) {
    emit({
      status: 'authenticated',
      user,
      accessToken,
      refreshToken,
      offline: true,
      endReason: null,
    });
  },

  setOnline() {
    if (state.offline) emit({ offline: false });
  },

  async end(reason: SessionEndReason) {
    await Promise.all([
      storage.remove(KEYS.access),
      storage.remove(KEYS.refresh),
      storage.remove(KEYS.user),
    ]);
    emit({
      status: 'anonymous',
      user: null,
      accessToken: null,
      refreshToken: null,
      offline: false,
      endReason: reason,
    });
  },

  markAnonymous() {
    emit({ status: 'anonymous' });
  },
};

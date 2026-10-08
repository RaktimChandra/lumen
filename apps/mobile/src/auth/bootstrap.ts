import NetInfo from '@react-native-community/netinfo';
import { api, ApiError, refreshSession } from '@/api/client';
import { clearCachedData } from '@/lib/query';
import { session } from './session';

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Launch flow: read the refresh token from secure storage and exchange it for a
 * fresh session. If the server says the session is over, the user lands on the
 * sign-in screen with an explanation. If the device is offline, the user stays
 * signed in with their saved data and we keep retrying in the background.
 */
export async function bootstrapSession(): Promise<void> {
  const saved = await session.load();
  if (!saved.refreshToken) {
    session.markAnonymous();
    return;
  }
  try {
    const result = await api.auth.refresh(saved.refreshToken);
    await session.signIn(result.user, result.accessToken, result.refreshToken);
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError && saved.user) {
      session.restoreOffline(saved.user, saved.accessToken, saved.refreshToken);
      scheduleReconnect();
      return;
    }
    await clearCachedData();
    await session.end('expired');
  }
}

function scheduleReconnect(delay = 15_000) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void reconnect(), delay);
}

async function reconnect() {
  if (!session.get().offline) return;
  try {
    const token = await refreshSession();
    if (!token) {
      await clearCachedData();
      await session.end('expired');
    }
  } catch {
    scheduleReconnect(30_000);
  }
}

// Reconnect as soon as the network comes back.
NetInfo.addEventListener((state) => {
  if (state.isConnected && session.get().offline) void reconnect();
});

export async function signOut(): Promise<void> {
  const { accessToken, refreshToken } = session.get();
  await api.auth.logout(accessToken, refreshToken ?? undefined);
  await clearCachedData();
  await session.end('signed-out');
}

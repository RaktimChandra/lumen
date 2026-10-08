import { ApiError, createApiClient } from '@lumen/shared';
import Constants from 'expo-constants';
import { session } from '@/auth/session';

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://lumen-api.onrender.com'
).replace(/\/$/, '');

let refreshing: Promise<string | null> | null = null;

/** Exchange the stored refresh token for a new access token (rotating the refresh token). */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    const refreshToken = session.get().refreshToken;
    if (!refreshToken) return null;
    try {
      const result = await api.auth.refresh(refreshToken);
      await session.signIn(result.user, result.accessToken, result.refreshToken);
      return result.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) throw error;
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export const api = createApiClient({
  baseUrl: API_URL,
  platform: 'mobile',
  timeoutMs: 25_000,
  getAccessToken: () => session.get().accessToken,
  refreshAccessToken: refreshSession,
  onSessionEnded(reason) {
    if (session.get().status === 'authenticated') void session.end(reason);
  },
});

export { ApiError };

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  if (error instanceof ApiError) {
    if (error.isNetworkError)
      return "You're offline or the server can't be reached. Check your connection and try again.";
    return error.message;
  }
  return fallback;
}

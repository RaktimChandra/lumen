import { ApiError, createApiClient } from '@lumen/shared';
import { session } from './session';

/**
 * Same-origin by default: in development Vite proxies /api, in production Vercel
 * rewrites /api to the API service. That keeps the refresh cookie first-party.
 */
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export const api = createApiClient({
  baseUrl,
  platform: 'web',
  getAccessToken: () => session.get().accessToken,
  async refreshAccessToken() {
    try {
      const result = await api.auth.refresh();
      session.signIn(result.user, result.accessToken);
      return result.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) throw error;
      return null;
    }
  },
  onSessionEnded(reason) {
    if (session.get().status === 'authenticated') session.end(reason);
  },
});

export { ApiError };

/** A user-facing message for any thrown value. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

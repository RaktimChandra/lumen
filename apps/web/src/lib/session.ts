import type { User } from '@lumen/shared';

/**
 * In-memory session state. The access token lives only in this module (never in
 * localStorage), so an XSS payload cannot read a long-lived credential; the refresh
 * token is an httpOnly cookie the browser sends only to /api/auth.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
export type SessionEndReason = 'expired' | 'revoked' | 'signed-out';

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  accessToken: string | null;
  endReason: SessionEndReason | null;
}

type Listener = (state: SessionState) => void;

let state: SessionState = { status: 'loading', user: null, accessToken: null, endReason: null };
const listeners = new Set<Listener>();

export const session = {
  get: () => state,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(next: Partial<SessionState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  },
  signIn(user: User, accessToken: string) {
    session.set({ status: 'authenticated', user, accessToken, endReason: null });
  },
  end(reason: SessionEndReason) {
    session.set({ status: 'anonymous', user: null, accessToken: null, endReason: reason });
  },
};
